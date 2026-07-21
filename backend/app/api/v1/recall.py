import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from ...config import settings
from ...db.session import get_session
from ...api.deps import current_user
from ...models.core import User, WorkspaceMember
from ...jobs import process_recall_webhook
from ...models.meetings import Meeting, MeetingProvider, MeetingStatus
from ...models.webhooks import WebhookEvent
from ...schemas.recall import CreateRecallBotRequest
from ...services.recall_client import RecallAPIError, RecallClient
from ...services.recall_security import RecallSignatureVerifier

router = APIRouter(prefix="/recall", tags=["recall"])
def provider_for_url(url: str) -> MeetingProvider:
    host = url.lower()
    if "zoom" in host: return MeetingProvider.ZOOM
    if "teams" in host: return MeetingProvider.MICROSOFT_TEAMS
    if "slack" in host: return MeetingProvider.SLACK_HUDDLE
    return MeetingProvider.GOOGLE_MEET
@router.post("/bots", status_code=status.HTTP_201_CREATED)
async def create_bot(body: CreateRecallBotRequest, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    workspace_id = uuid.UUID(body.workspace_id)
    member=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==workspace_id,WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if not member or member.role.value not in ("owner","admin"): raise HTTPException(status_code=403,detail="Workspace administrator access required")
    meeting = Meeting(workspace_id=workspace_id, provider=body.provider or provider_for_url(str(body.meeting_url)), join_url=str(body.meeting_url), title=body.title, scheduled_at=body.join_at, status=MeetingStatus.JOINING)
    session.add(meeting); await session.flush()
    try:
        recall_bot = await RecallClient().create_bot(meeting_url=str(body.meeting_url), bot_name=body.bot_name, join_at=body.join_at, metadata={"closeloop_meeting_id": str(meeting.id), "workspace_id": body.workspace_id})
    except RecallAPIError as error:
        meeting.status = MeetingStatus.FAILED; meeting.raw_metadata = {"recall_error": str(error)}
        await session.commit()
        raise HTTPException(status_code=502, detail="Recall could not create the bot") from error
    meeting.recall_bot_id = recall_bot["id"]; meeting.raw_metadata = {"recall": recall_bot}
    await session.commit()
    return {"meeting_id": str(meeting.id), "bot_id": meeting.recall_bot_id, "status": meeting.status}
async def receive_event(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    raw_body = await request.body()
    secret = settings.recall_svix_webhook_secret or settings.recall_workspace_verification_secret
    event_id = RecallSignatureVerifier(secret).verify({k.lower(): v for k, v in request.headers.items()}, raw_body)
    try: payload = await request.json()
    except ValueError as error: raise HTTPException(400, "Invalid JSON") from error
    event_type = payload.get("event") or payload.get("type")
    if not event_type: raise HTTPException(400, "Recall event type missing")
    statement = insert(WebhookEvent).values(provider="recall", event_id=event_id, event_type=event_type, payload=payload).on_conflict_do_nothing(index_elements=["provider", "event_id"]).returning(WebhookEvent.id)
    event_db_id = (await session.execute(statement)).scalar_one_or_none()
    await session.commit()
    if event_db_id: process_recall_webhook.delay(str(event_db_id))
    return {"accepted": True, "duplicate": event_db_id is None}
@router.post("/webhooks/dashboard", status_code=status.HTTP_202_ACCEPTED)
async def dashboard_webhook(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    return await receive_event(request, session)
@router.post("/webhooks/realtime", status_code=status.HTTP_202_ACCEPTED)
async def realtime_webhook(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    return await receive_event(request, session)
