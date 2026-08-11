import asyncio
import logging
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.meetings import (
    Meeting,
    MeetingStatus,
    Speaker,
    Transcript,
    TranscriptChunk,
)
from ..models.webhooks import WebhookEvent
from .recall_client import RecallAPIError, RecallClient

log = logging.getLogger(__name__)

TERMINAL_EVENTS = {"bot.done", "recording.done", "transcript.done"}


async def process_recall_event(session: AsyncSession, event: WebhookEvent) -> None:
    payload, event_type = event.payload, event.event_type
    data = payload.get("data", payload)
    bot_id = data.get("bot_id") or data.get("bot", {}).get("id")
    meeting = (
        await session.execute(select(Meeting).where(Meeting.recall_bot_id == bot_id))
    ).scalar_one_or_none()
    if not meeting:
        event.error = "No meeting found for Recall bot"
        return
    event.meeting_id = meeting.id
    if event_type in (
        "bot.joined",
        "bot.in_call_recording",
        "bot.status_change",
    ) and data.get("status") in (None, "in_call_recording"):
        meeting.status, meeting.started_at = (
            MeetingStatus.IN_PROGRESS,
            meeting.started_at or event.received_at,
        )
    elif event_type in ("bot.left", "bot.done"):
        meeting.status, meeting.ended_at = MeetingStatus.ENDED, event.received_at
    elif event_type == "recording.done":
        meeting.status = MeetingStatus.ENDED
    elif event_type in ("transcript.data", "transcript.partial_data"):
        transcript = (
            await session.execute(
                select(Transcript).where(Transcript.meeting_id == meeting.id)
            )
        ).scalar_one_or_none()
        if not transcript:
            transcript = Transcript(
                meeting_id=meeting.id, recall_transcript_id=data.get("transcript_id")
            )
            session.add(transcript)
            await session.flush()
        for i, utterance in enumerate(data.get("data", data.get("utterances", [data]))):
            utterance_id = utterance.get("id") or utterance.get("utterance_id")
            if not utterance_id:
                continue
            provider_speaker = str(utterance.get("speaker_id", "unknown"))
            speaker = (
                await session.execute(
                    select(Speaker).where(
                        Speaker.meeting_id == meeting.id,
                        Speaker.provider_speaker_id == provider_speaker,
                    )
                )
            ).scalar_one_or_none()
            if not speaker:
                speaker = Speaker(
                    meeting_id=meeting.id,
                    provider_speaker_id=provider_speaker,
                    display_name=utterance.get("speaker"),
                )
                session.add(speaker)
                await session.flush()
            existing = (
                await session.execute(
                    select(TranscriptChunk).where(
                        TranscriptChunk.transcript_id == transcript.id,
                        TranscriptChunk.provider_utterance_id == utterance_id,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                existing.text, existing.is_final = (
                    utterance.get("text", existing.text),
                    event_type == "transcript.data",
                )
            else:
                session.add(
                    TranscriptChunk(
                        transcript_id=transcript.id,
                        speaker_id=speaker.id,
                        provider_utterance_id=utterance_id,
                        sequence=utterance.get("sequence", i),
                        text=utterance.get("text", ""),
                        started_ms=(
                            int(
                                utterance.get("start_timestamp", {}).get("relative", 0)
                                * 1000
                            )
                            if isinstance(
                                utterance.get("start_timestamp", {}).get("relative"),
                                float,
                            )
                            else utterance.get("start_timestamp", {}).get("relative")
                        ),
                        ended_ms=(
                            int(
                                utterance.get("end_timestamp", {}).get("relative", 0)
                                * 1000
                            )
                            if isinstance(
                                utterance.get("end_timestamp", {}).get("relative"),
                                float,
                            )
                            else utterance.get("end_timestamp", {}).get("relative")
                        ),
                        is_final=event_type == "transcript.data",
                        raw_payload=utterance,
                    )
                )
    elif event_type in ("transcript.done", "recording.done", "bot.done"):
        meeting.status = MeetingStatus.ENDED
        transcript = (
            await session.execute(
                select(Transcript).where(Transcript.meeting_id == meeting.id)
            )
        ).scalar_one_or_none()
        if transcript:
            transcript.status = "done"
    event.processed_at = event.received_at


def _relative_ms(timestamp: object) -> int | None:
    if not isinstance(timestamp, dict):
        return None
    relative = timestamp.get("relative")
    if relative is None:
        return None
    return int(float(relative) * 1000)


async def finalize_meeting(session: AsyncSession, meeting_id: str) -> dict:
    """Fetch the complete post-meeting transcript from Recall, persist it as
    ordered chunks, and report whether the meeting is ready for extraction.

    This is the single ingestion point now that we no longer stream partial
    transcripts: it is called once the bot finishes recording."""
    meeting = await session.get(Meeting, meeting_id)
    if not meeting or not meeting.recall_bot_id:
        return {"status": "no_meeting"}
    transcript = (
        await session.execute(
            select(Transcript).where(Transcript.meeting_id == meeting.id)
        )
    ).scalar_one_or_none()
    if not transcript:
        transcript = Transcript(meeting_id=meeting.id, status="processing")
        session.add(transcript)
        await session.flush()

    client = RecallClient()
    try:
        bot = await client.retrieve_bot(meeting.recall_bot_id)
        url = client.transcript_download_url(bot)
        if not url:
            return {"status": "transcript_not_ready"}
        segments = await client.download_transcript(url)
    except RecallAPIError as error:
        log.warning("finalize_meeting fetch failed for %s: %s", meeting_id, error)
        return {"status": "error", "detail": str(error)}

    sequence = 0
    for segment in segments:
        participant = segment.get("participant") or {}
        provider_speaker = str(
            participant.get("id", participant.get("name", "unknown"))
        )
        speaker = (
            await session.execute(
                select(Speaker).where(
                    Speaker.meeting_id == meeting.id,
                    Speaker.provider_speaker_id == provider_speaker,
                )
            )
        ).scalar_one_or_none()
        if not speaker:
            speaker = Speaker(
                meeting_id=meeting.id,
                provider_speaker_id=provider_speaker,
                display_name=participant.get("name"),
            )
            session.add(speaker)
            await session.flush()
        words = segment.get("words") or []
        text = segment.get("text") or " ".join(
            str(word.get("text", "")) for word in words
        ).strip()
        if not text:
            continue
        started_ms = _relative_ms(words[0].get("start_timestamp")) if words else None
        ended_ms = _relative_ms(words[-1].get("end_timestamp")) if words else None
        utterance_id = f"seg-{sequence}"
        existing = (
            await session.execute(
                select(TranscriptChunk).where(
                    TranscriptChunk.transcript_id == transcript.id,
                    TranscriptChunk.provider_utterance_id == utterance_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.text, existing.is_final = text, True
        else:
            session.add(
                TranscriptChunk(
                    transcript_id=transcript.id,
                    speaker_id=speaker.id,
                    provider_utterance_id=utterance_id,
                    sequence=sequence,
                    text=text,
                    started_ms=started_ms,
                    ended_ms=ended_ms,
                    is_final=True,
                    raw_payload=segment,
                )
            )
        sequence += 1
    transcript.status = "done"
    meeting.status = MeetingStatus.ENDED
    await session.commit()
    return {"status": "ready", "transcript_id": str(transcript.id), "chunks": sequence}


async def run_recall_pipeline(event_db_id: str, *, extract: bool = True) -> dict:
    """Process a stored Recall webhook end-to-end, in-process.

    This is the single, worker-free ingestion path used by the webhook
    endpoints via FastAPI BackgroundTasks:

      1. Process the event (link the meeting, update status, store chunks).
      2. On a terminal event, download the complete transcript (retrying while
         Recall is still producing the artifact).
      3. Run meeting extraction so task candidates appear in the approval queue.

    It creates its own DB sessions because it runs after the HTTP response is
    returned (the request-scoped session is already closed).
    """
    from ..db.session import SessionLocal
    from .meeting_extraction import run_extraction

    # 1. Process the event
    async with SessionLocal() as session:
        event = await session.get(WebhookEvent, event_db_id)
        if not event or event.processed_at:
            return {"status": "skipped"}
        await process_recall_event(session, event)
        meeting_id = str(event.meeting_id) if event.meeting_id else None
        is_terminal = event.event_type in TERMINAL_EVENTS
        await session.commit()

    if not (is_terminal and meeting_id):
        return {"status": "processed", "meeting_id": meeting_id}

    # 2. Finalize — retry while the transcript artifact is still being produced
    transcript_id = None
    for attempt in range(8):
        async with SessionLocal() as session:
            result = await finalize_meeting(session, meeting_id)
        status = result.get("status")
        if status == "ready":
            transcript_id = result["transcript_id"]
            break
        if status == "transcript_not_ready":
            await asyncio.sleep(min(8 + attempt * 4, 30))
            continue
        # no_meeting / error — nothing more we can do
        log.warning("finalize_meeting for %s returned %s", meeting_id, status)
        return {"status": status, "meeting_id": meeting_id}

    if not transcript_id:
        log.warning("Transcript never became ready for meeting %s", meeting_id)
        return {"status": "transcript_not_ready", "meeting_id": meeting_id}

    # 3. Extract task candidates (best-effort — don't fail the pipeline)
    if extract:
        async with SessionLocal() as session:
            try:
                await run_extraction(session, transcript_id)
            except Exception:
                log.exception("Extraction failed for transcript %s", transcript_id)

    return {"status": "ready", "transcript_id": transcript_id, "meeting_id": meeting_id}
