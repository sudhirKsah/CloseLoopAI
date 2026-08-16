import asyncio, json, logging
from dataclasses import dataclass
from datetime import UTC, datetime
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..services.directory import resolve_owner
from ..models.meetings import (
    Meeting,
    MeetingExtraction,
    Speaker,
    Transcript,
    TranscriptChunk,
)
from ..models.work import CandidateState, Decision, TaskCandidate
from ..services.approvals import TaskApprovalService
from ..schemas.extraction import MeetingExtractionResult

log = logging.getLogger(__name__)
SYSTEM_PROMPT = """You extract execution facts from meeting transcripts. Return only the required structured result.
Use only evidence explicitly supported by transcript chunks. Every decision, task, risk, and question needs one or more exact chunk IDs and short direct quotes. Do not invent owners, deadlines, dependencies, or risks. A missing field means unknown. Task refs must be T1, T2..., and dependencies must use those refs. Confidence is 0 to 1 and reflects evidence strength, not importance."""


class ExtractionError(RuntimeError):
    pass


# Validation keywords Cerebras/OpenAI strict structured output does not accept.
_UNSUPPORTED_SCHEMA_KEYS = {
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minItems",
    "maxItems",
    "uniqueItems",
    "default",
}


def _strict_schema(schema: dict) -> dict:
    """Prepare a Pydantic JSON schema for strict structured-output mode:

    - Enforce `additionalProperties: false` on every object (required by strict
      mode; Pydantic omits it by default).
    - Strip validation-only keywords (minLength, maxLength, pattern, ...) that
      the provider rejects.
    """

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                node.setdefault("additionalProperties", False)
            for key in list(node.keys()):
                if key in _UNSUPPORTED_SCHEMA_KEYS:
                    del node[key]
                else:
                    walk(node[key])
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
    return schema


@dataclass(frozen=True)
class ChunkInput:
    id: str
    speaker: str | None
    text: str
    started_ms: int | None


def transcript_prompt(chunks: list[ChunkInput]) -> str:
    return (
        "Transcript chunks (the id values are the only valid evidence references):\n"
        + "\n".join(
            f"[{c.id}] speaker={c.speaker or 'Unknown'} time_ms={c.started_ms}: {c.text}"
            for c in chunks
        )
    )


class MeetingExtractionProvider:
    async def extract(self, chunks: list[ChunkInput]) -> MeetingExtractionResult:
        raise NotImplementedError


class OpenAIExtractionProvider(MeetingExtractionProvider):
    async def extract(self, chunks: list[ChunkInput]) -> MeetingExtractionResult:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.beta.chat.completions.parse(
            model=settings.meeting_extraction_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": transcript_prompt(chunks)},
            ],
            response_format=MeetingExtractionResult,
        )
        parsed = response.choices[0].message.parsed
        if not parsed:
            raise ExtractionError("OpenAI returned no structured result")
        return parsed


class CerebrasExtractionProvider(MeetingExtractionProvider):
    async def extract(self, chunks: list[ChunkInput]) -> MeetingExtractionResult:
        def request() -> str:
            from cerebras.cloud.sdk import Cerebras

            client = Cerebras(api_key=settings.cerebras_api_key)
            response = client.chat.completions.create(
                model=settings.cerebras_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": transcript_prompt(chunks)},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "meeting_extraction",
                        "strict": True,
                        "schema": _strict_schema(
                            MeetingExtractionResult.model_json_schema()
                        ),
                    },
                },
                max_completion_tokens=32768,
                temperature=0.1,
            )
            return response.choices[0].message.content or ""

        try:
            return MeetingExtractionResult.model_validate_json(
                await asyncio.to_thread(request)
            )
        except (ValueError, json.JSONDecodeError) as error:
            raise ExtractionError(
                "Cerebras returned malformed structured output"
            ) from error


class GeminiExtractionProvider(MeetingExtractionProvider):
    """Google Gemini via OpenAI-compatible endpoint.

    Uses the free-tier Gemini API (generativelanguage.googleapis.com) which
    satisfies the Build with Gemini XPRIZE requirement for Google Cloud usage.
    No additional package needed — the `openai` SDK works with Gemini's
    OpenAI-compatible API.
    """

    async def extract(self, chunks: list[ChunkInput]) -> MeetingExtractionResult:
        client = AsyncOpenAI(
            api_key=settings.gemini_api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        response = await client.chat.completions.create(
            model=settings.gemini_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": transcript_prompt(chunks)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "meeting_extraction",
                    "strict": True,
                    "schema": _strict_schema(
                        MeetingExtractionResult.model_json_schema()
                    ),
                },
            },
            max_completion_tokens=8192,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or ""
        try:
            return MeetingExtractionResult.model_validate_json(raw)
        except (ValueError, json.JSONDecodeError) as error:
            raise ExtractionError(
                "Gemini returned malformed structured output"
            ) from error


def configured_provider() -> MeetingExtractionProvider:
    if settings.ai_provider == "cerebras":
        return CerebrasExtractionProvider()
    if settings.ai_provider == "openai":
        return OpenAIExtractionProvider()
    if settings.ai_provider == "gemini":
        return GeminiExtractionProvider()
    raise ExtractionError(f"Unsupported extraction provider: {settings.ai_provider}")


def configured_providers() -> list[MeetingExtractionProvider]:
    """Return the primary provider followed by fallback providers.

    The primary is determined by ``settings.ai_provider``. Fallbacks are
    tried in order: any other provider whose API key is configured.
    """
    primary = settings.ai_provider
    providers: list[MeetingExtractionProvider] = []

    # Build the ordered list: primary first, then others with keys
    order = [primary]
    for name in ("gemini", "cerebras", "openai"):
        if name != primary:
            order.append(name)

    for name in order:
        if name == "gemini" and settings.gemini_api_key:
            providers.append(GeminiExtractionProvider())
        elif name == "cerebras" and settings.cerebras_api_key:
            providers.append(CerebrasExtractionProvider())
        elif name == "openai" and settings.openai_api_key:
            providers.append(OpenAIExtractionProvider())

    if not providers:
        raise ExtractionError(
            f"No extraction provider configured (ai_provider={primary}, "
            "no API keys set)"
        )
    return providers


async def extract_with_retry(
    providers: MeetingExtractionProvider | list[MeetingExtractionProvider],
    chunks: list[ChunkInput],
    attempts: int = 2,
) -> MeetingExtractionResult:
    """Try each provider with retries, falling back to the next on failure."""
    if not isinstance(providers, list):
        providers = [providers]
    last_error: Exception | None = None
    for idx, provider in enumerate(providers):
        provider_name = type(provider).__name__
        for attempt in range(attempts):
            try:
                result = await provider.extract(chunks)
                valid_chunk_ids = {chunk.id for chunk in chunks}
                refs = [
                    ref.chunk_id
                    for item in [
                        *result.decisions,
                        *result.tasks,
                        *result.risks,
                        *result.questions,
                    ]
                    for ref in item.references
                ]
                if not set(refs).issubset(valid_chunk_ids):
                    raise ExtractionError(
                        "Model referenced a chunk outside this transcript"
                    )
                return result
            except Exception as error:
                last_error = error
                log.warning(
                    "Meeting extraction %s attempt %s failed: %s",
                    provider_name,
                    attempt + 1,
                    type(error).__name__,
                )
                if attempt < attempts - 1:
                    await asyncio.sleep(2**attempt)
        if idx < len(providers) - 1:
            log.warning("Falling back from %s to next provider", provider_name)
    raise ExtractionError("Meeting extraction retry budget exhausted") from last_error


async def run_extraction(
    session: AsyncSession, transcript_id: str
) -> MeetingExtraction:
    transcript = await session.get(Transcript, transcript_id)
    if not transcript:
        raise ExtractionError("Transcript not found")
    extraction = (
        await session.execute(
            select(MeetingExtraction).where(
                MeetingExtraction.transcript_id == transcript.id
            )
        )
    ).scalar_one_or_none()
    if extraction and extraction.status == "completed":
        return extraction
    rows_with_speakers = (
        await session.execute(
            select(TranscriptChunk, Speaker)
            .outerjoin(Speaker, Speaker.id == TranscriptChunk.speaker_id)
            .where(
                TranscriptChunk.transcript_id == transcript.id,
                TranscriptChunk.is_final.is_(True),
            )
            .order_by(TranscriptChunk.sequence)
        )
    ).all()
    rows = [row for row, _speaker in rows_with_speakers]
    if not rows:
        raise ExtractionError("Transcript has no final chunks")
    chunks = [
        ChunkInput(
            str(row.id),
            speaker.display_name if speaker else None,
            row.text,
            row.started_ms,
        )
        for row, speaker in rows_with_speakers
    ]
    if not extraction:
        extraction = MeetingExtraction(
            transcript_id=transcript.id,
            provider=settings.ai_provider,
            model=(
                settings.cerebras_model
                if settings.ai_provider == "cerebras"
                else settings.meeting_extraction_model
            ),
        )
        session.add(extraction)
    extraction.status = "processing"
    await session.commit()
    try:
        result = await extract_with_retry(configured_providers(), chunks)
    except Exception as error:
        extraction.status, extraction.error = "failed", str(error)
        await session.commit()
        raise
    meeting = await session.get(Meeting, transcript.meeting_id)
    if not meeting:
        raise ExtractionError("Meeting not found")
    for decision in result.decisions:
        session.add(
            Decision(
                meeting_id=meeting.id,
                title=decision.title,
                rationale=decision.rationale,
                confidence=decision.confidence,
                source_chunk_ids=[
                    reference.model_dump() for reference in decision.references
                ],
            )
        )
    candidates: list[TaskCandidate] = []
    for item in result.tasks:
        owner = await resolve_owner(session, meeting.workspace_id, item.owner_name)
        candidate = TaskCandidate(
            extraction_id=extraction.id,
            workspace_id=meeting.workspace_id,
            ref=item.ref,
            title=item.title,
            description=item.description,
            owner_id=owner.id if owner else None,
            owner_name=item.owner_name,
            due_at=item.deadline,
            confidence=item.confidence,
            evidence=[reference.model_dump() for reference in item.references],
            dependency_refs=item.dependency_refs,
            state=(
                CandidateState.AUTO_APPROVED
                if item.confidence >= settings.task_auto_approve_confidence
                else CandidateState.PENDING
            ),
        )
        session.add(candidate)
        candidates.append(candidate)
    await session.flush()
    approvals = TaskApprovalService()
    for candidate in candidates:
        if candidate.state == CandidateState.AUTO_APPROVED:
            await approvals.materialize(session, candidate)
    for candidate in candidates:
        if candidate.task_id:
            await approvals.materialize_dependencies(session, candidate)
    (
        extraction.status,
        extraction.summary,
        extraction.confidence,
        extraction.result,
        extraction.error,
    ) = (
        "completed",
        result.meeting_summary,
        result.confidence,
        result.model_dump(mode="json"),
        None,
    )
    await session.commit()
    return extraction
