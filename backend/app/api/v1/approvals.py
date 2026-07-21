import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...db.session import get_session
from ...api.deps import current_user, require_workspace_admin
from ...models.core import User, WorkspaceMember
from ...services.approvals import ApprovalError, TaskApprovalService
from ...models.work import TaskCandidate
router=APIRouter(prefix="/task-candidates",tags=["approvals"])
class ReviewRequest(BaseModel): reviewer_id: uuid.UUID; decision: str; edit: dict | None=None
@router.get("/workspace/{workspace_id}")
async def candidates(workspace_id:uuid.UUID,_:User=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(TaskCandidate).where(TaskCandidate.workspace_id==workspace_id).order_by(TaskCandidate.created_at.desc()))).scalars().all()
    return [{"id":str(x.id),"title":x.title,"description":x.description,"owner":x.owner_name,"deadline":x.due_at,"confidence":x.confidence,"evidence":x.evidence,"state":x.state.value,"task_id":str(x.task_id) if x.task_id else None} for x in rows]
@router.get("/{candidate_id}")
async def candidate(candidate_id:uuid.UUID,user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->dict:
    item=await session.get(TaskCandidate,candidate_id)
    if not item: raise HTTPException(404,"Task candidate not found")
    member=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==item.workspace_id,WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if not member or member.role.value not in ("owner","admin"): raise HTTPException(403,"Workspace administrator access required")
    return {"id":str(item.id),"title":item.title,"owner":item.owner_name,"deadline":item.due_at,"confidence":item.confidence,"evidence":item.evidence,"state":item.state,"task_id":str(item.task_id) if item.task_id else None}
@router.post("/{candidate_id}/review")
async def review(candidate_id:uuid.UUID,body:ReviewRequest,user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->dict:
    if body.reviewer_id!=user.id: raise HTTPException(403,"Reviewer identity does not match the authenticated user")
    candidate_item=await session.get(TaskCandidate,candidate_id)
    if not candidate_item: raise HTTPException(404,"Task candidate not found")
    member=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==candidate_item.workspace_id,WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if not member or member.role.value not in ("owner","admin"): raise HTTPException(403,"Workspace administrator access required")
    try: item=await TaskApprovalService().review(session,candidate_id,body.decision,body.reviewer_id,body.edit)
    except ApprovalError as error: raise HTTPException(400,str(error)) from error
    return {"id":str(item.id),"state":item.state,"task_id":str(item.task_id) if item.task_id else None}
