"""Client for the kgmemory microservice (the team's knowledge-graph "PM brain").

kgmemory is a separate FastAPI service (see ../../../memory-pinchfast) that
ingests conversation facts into a per-organization knowledge graph and
exposes decision-support endpoints: hybrid context search, person
reliability, project health, and an AI project-manager reasoning layer
(`/pm/decide`, `/pm/check-in`). CloseLoop treats it as its long-term memory
layer: meeting transcripts are pushed into kgmemory so that decisions,
commitments, and engineer reliability accumulate across meetings instead of
being scoped to a single extraction.

Each CloseLoop workspace that wants this maps 1:1 to a kgmemory organization,
via an `Integration(provider=KGMEMORY)` row whose `config` holds the
kgmemory org's API key (Fernet-encrypted, same as other provider secrets)
under `api_key_encrypted`.
"""

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.integrations import Integration, IntegrationProvider
from .credentials import CredentialVault

log = logging.getLogger(__name__)


class KGMemoryError(RuntimeError):
    pass


class KGMemoryClient:
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or settings.kgmemory_base_url).rstrip("/")

    async def _request(self, method: str, path: str, **kwargs: object) -> dict:
        async with httpx.AsyncClient(
            base_url=self.base_url, timeout=settings.kgmemory_request_timeout
        ) as client:
            response = await client.request(
                method,
                path,
                headers={"X-API-Key": self.api_key},
                **kwargs,
            )
            if response.status_code >= 400:
                raise KGMemoryError(
                    f"kgmemory {method} {path} failed: {response.status_code} {response.text[:300]}"
                )
            return response.json() if response.content else {}

    async def ingest_batch(self, messages: list[dict]) -> dict:
        return await self._request(
            "POST", "/memory/ingest/batch", json={"messages": messages}
        )

    async def ingest(self, message: dict) -> dict:
        return await self._request("POST", "/memory/ingest", json=message)

    async def list_people(self) -> list[dict]:
        return await self._request("GET", "/people/")

    async def person(self, name: str) -> dict:
        return await self._request("GET", f"/people/{name}")

    async def decide(self, query: str, audience: str = "founder_non_technical") -> dict:
        return await self._request(
            "POST", "/pm/decide", json={"query": query, "audience": audience}
        )

    async def check_in_auto(self) -> dict:
        return await self._request("POST", "/pm/check-in/auto")


async def sync_meeting(session: AsyncSession, meeting_id: str) -> dict:
    """Push a meeting's transcript and extracted decisions into kgmemory so
    they become durable, cross-meeting facts (commitments, status updates,
    decisions) in the workspace's knowledge graph.
    """
    from ..models.meetings import Meeting, Speaker, Transcript, TranscriptChunk
    from ..models.work import Decision

    meeting = await session.get(Meeting, meeting_id)
    if not meeting:
        return {"status": "no_meeting"}
    client = await get_client_for_workspace(session, str(meeting.workspace_id))
    if not client:
        return {"status": "kgmemory_not_connected"}

    rows = (
        await session.execute(
            select(TranscriptChunk, Speaker)
            .join(Transcript, Transcript.id == TranscriptChunk.transcript_id)
            .outerjoin(Speaker, Speaker.id == TranscriptChunk.speaker_id)
            .where(
                Transcript.meeting_id == meeting.id,
                TranscriptChunk.is_final.is_(True),
            )
            .order_by(TranscriptChunk.sequence)
        )
    ).all()
    project = meeting.title or str(meeting.workspace_id)
    messages = [
        {
            "message": chunk.text,
            "speaker": speaker.display_name if speaker else "unknown",
            "speaker_role": "engineer",
            "channel": meeting.provider.value,
            "project": project,
        }
        for chunk, speaker in rows
        if chunk.text.strip()
    ]
    decisions = (
        (
            await session.execute(
                select(Decision).where(Decision.meeting_id == meeting.id)
            )
        )
        .scalars()
        .all()
    )
    messages += [
        {
            "message": f"Decision: {decision.title}. {decision.rationale or ''}".strip(),
            "speaker": "meeting",
            "speaker_role": "founder",
            "channel": "decision",
            "project": project,
        }
        for decision in decisions
    ]
    if not messages:
        return {"status": "no_content"}
    try:
        result = await client.ingest_batch(messages)
    except KGMemoryError as error:
        log.warning("kgmemory sync failed for meeting %s: %s", meeting_id, error)
        return {"status": "error", "detail": str(error)}
    return {"status": "queued", "message_count": len(messages), **result}


async def get_client_for_workspace(
    session: AsyncSession, workspace_id: str
) -> KGMemoryClient | None:
    """Return a configured KGMemoryClient for a workspace, or None if the
    workspace hasn't connected kgmemory yet."""
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.workspace_id == workspace_id,
                Integration.provider == IntegrationProvider.KGMEMORY,
            )
        )
    ).scalar_one_or_none()
    if not integration or not integration.config.get("api_key_encrypted"):
        return None
    api_key = CredentialVault().decrypt(integration.config["api_key_encrypted"])
    base_url = integration.config.get("base_url") or settings.kgmemory_base_url
    return KGMemoryClient(api_key, base_url)
