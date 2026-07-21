import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.meetings import Meeting, MeetingStatus, Speaker, Transcript, TranscriptChunk
from ..models.webhooks import WebhookEvent
async def process_recall_event(session: AsyncSession, event: WebhookEvent) -> None:
    payload, event_type = event.payload, event.event_type
    data = payload.get("data", payload)
    bot_id = data.get("bot_id") or data.get("bot", {}).get("id")
    meeting = (await session.execute(select(Meeting).where(Meeting.recall_bot_id == bot_id))).scalar_one_or_none()
    if not meeting: event.error = "No meeting found for Recall bot"; return
    event.meeting_id = meeting.id
    if event_type in ("bot.joined", "bot.in_call_recording", "bot.status_change") and data.get("status") in (None, "in_call_recording"):
        meeting.status, meeting.started_at = MeetingStatus.IN_PROGRESS, meeting.started_at or event.received_at
    elif event_type in ("bot.left", "bot.done"):
        meeting.status, meeting.ended_at = MeetingStatus.ENDED, event.received_at
    elif event_type == "recording.done":
        meeting.status = MeetingStatus.ENDED
    elif event_type in ("transcript.data", "transcript.partial_data"):
        transcript = (await session.execute(select(Transcript).where(Transcript.meeting_id == meeting.id))).scalar_one_or_none()
        if not transcript:
            transcript = Transcript(meeting_id=meeting.id, recall_transcript_id=data.get("transcript_id")); session.add(transcript); await session.flush()
        for i, utterance in enumerate(data.get("data", data.get("utterances", [data]))):
            utterance_id = utterance.get("id") or utterance.get("utterance_id")
            if not utterance_id: continue
            provider_speaker = str(utterance.get("speaker_id", "unknown"))
            speaker = (await session.execute(select(Speaker).where(Speaker.meeting_id == meeting.id, Speaker.provider_speaker_id == provider_speaker))).scalar_one_or_none()
            if not speaker: speaker = Speaker(meeting_id=meeting.id, provider_speaker_id=provider_speaker, display_name=utterance.get("speaker")); session.add(speaker); await session.flush()
            existing = (await session.execute(select(TranscriptChunk).where(TranscriptChunk.transcript_id == transcript.id, TranscriptChunk.provider_utterance_id == utterance_id))).scalar_one_or_none()
            if existing: existing.text, existing.is_final = utterance.get("text", existing.text), event_type == "transcript.data"
            else: session.add(TranscriptChunk(transcript_id=transcript.id, speaker_id=speaker.id, provider_utterance_id=utterance_id, sequence=utterance.get("sequence", i), text=utterance.get("text", ""), started_ms=int(utterance.get("start_timestamp", {}).get("relative", 0) * 1000) if isinstance(utterance.get("start_timestamp", {}).get("relative"), float) else utterance.get("start_timestamp", {}).get("relative"), ended_ms=int(utterance.get("end_timestamp", {}).get("relative", 0) * 1000) if isinstance(utterance.get("end_timestamp", {}).get("relative"), float) else utterance.get("end_timestamp", {}).get("relative"), is_final=event_type == "transcript.data", raw_payload=utterance))
    elif event_type == "transcript.done":
        transcript = (await session.execute(select(Transcript).where(Transcript.meeting_id == meeting.id))).scalar_one_or_none()
        if transcript: transcript.status = "done"
    event.processed_at = event.received_at
