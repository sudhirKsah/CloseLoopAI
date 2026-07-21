import json, uuid
from urllib.parse import parse_qs
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...db.session import get_session
from ...models.core import ExternalIdentity
from ...services.approvals import TaskApprovalService
from ...services.slack import verify_slack
router=APIRouter(prefix="/slack",tags=["slack"])
@router.post("/actions")
async def slack_actions(request:Request,session:AsyncSession=Depends(get_session))->dict:
    body=await request.body(); verify_slack({key.lower():value for key,value in request.headers.items()},body)
    encoded=parse_qs(body.decode("utf-8"), keep_blank_values=True)
    if not encoded.get("payload"): raise HTTPException(400,"Slack action payload missing")
    payload=json.loads(encoded["payload"][0]); action=payload["actions"][0]; action_id=action["action_id"]; candidate_id=uuid.UUID(action["value"])
    identity=(await session.execute(select(ExternalIdentity).where(ExternalIdentity.provider=="slack",ExternalIdentity.external_user_id==payload["user"]["id"]))).scalar_one_or_none()
    if not identity: raise HTTPException(403,"Slack user is not linked to a CloseLoop user")
    if action_id=="closeloop_task_edit": return {"response_action":"push","view":{"type":"modal","title":{"type":"plain_text","text":"Edit in CloseLoop"},"close":{"type":"plain_text","text":"Close"},"blocks":[]}}
    candidate=await TaskApprovalService().review(session,candidate_id,"approve" if action_id=="closeloop_task_approve" else "reject",identity.user_id)
    return {"replace_original":True,"text":f"Task {candidate.state}."}
