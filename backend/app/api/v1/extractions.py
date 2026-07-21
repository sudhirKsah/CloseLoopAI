import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...db.session import get_session
from ...jobs import process_meeting_extraction
from ...models.meetings import MeetingExtraction, Meeting, Transcript
from ...models.core import User, WorkspaceMember
from ...api.deps import current_user

router = APIRouter(prefix="/transcripts", tags=["meeting-extraction"])

async def check_transcript_access(session: AsyncSession, transcript_id: uuid.UUID, user: User) -> None:
    transcript = await session.get(Transcript, transcript_id)
    if not transcript:
        raise HTTPException(404, "Transcript not found")
    meeting = await session.get(Meeting, transcript.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    member = (await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == meeting.workspace_id,
            WorkspaceMember.user_id == user.id
        )
    )).scalar_one_or_none()
    if not member or member.role.value not in ("owner", "admin"):
        raise HTTPException(403, "Workspace administrator access required")

@router.post("/{transcript_id}/extract", status_code=status.HTTP_202_ACCEPTED)
async def enqueue_extraction(transcript_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    await check_transcript_access(session, transcript_id, user)
    job = process_meeting_extraction.delay(str(transcript_id))
    return {"transcript_id": str(transcript_id), "job_id": job.id, "status": "queued"}

@router.get("/{transcript_id}/extraction")
async def get_extraction(transcript_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    await check_transcript_access(session, transcript_id, user)
    result = (await session.execute(select(MeetingExtraction).where(MeetingExtraction.transcript_id == transcript_id))).scalar_one_or_none()
    if not result: raise HTTPException(404, "No extraction exists for this transcript")
    return {"id": str(result.id), "status": result.status, "summary": result.summary, "confidence": result.confidence, "result": result.result, "error": result.error}

