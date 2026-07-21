import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from ...api.deps import require_workspace_admin
from ...db.session import get_session
from ...models.core import User, WorkspaceMember
from ...models.integrations import Integration
from ...models.meetings import Meeting, Transcript, TranscriptChunk, MeetingExtraction
from ...models.operations import Insight
from ...models.work import Task, TaskActivityMatch, TaskDependency, TaskState
router=APIRouter(prefix="/workspaces",tags=["workspace-data"])
async def check(workspace_id:uuid.UUID,user=Depends(require_workspace_admin)): return user
@router.get("/{workspace_id}/overview")
async def overview(workspace_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->dict:
    tasks=(await session.execute(select(Task).where(Task.workspace_id==workspace_id))).scalars().all()
    open_tasks=[x for x in tasks if x.state not in (TaskState.COMPLETED,TaskState.CANCELLED)]
    meetings=(await session.execute(select(func.count(Meeting.id)).where(Meeting.workspace_id==workspace_id))).scalar_one()
    score=round(sum(x.execution_score for x in tasks)/len(tasks),1) if tasks else 0
    return {"execution_score":score,"task_count":len(tasks),"on_track":sum(x.state in (TaskState.OPEN,TaskState.IN_PROGRESS) for x in tasks),"at_risk":sum(x.state in (TaskState.BLOCKED,TaskState.OVERDUE) for x in tasks),"meetings":meetings,"tasks":[serialize_task(x) for x in sorted(open_tasks,key=lambda x:(x.state.value,x.due_at or x.created_at))[:8]]}
@router.get("/{workspace_id}/tasks")
async def tasks(workspace_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(Task).where(Task.workspace_id==workspace_id).order_by(Task.due_at.nulls_last(),Task.created_at.desc()))).scalars().all()
    return [serialize_task(x) for x in rows]
@router.post("/{workspace_id}/tasks")
async def create_task(workspace_id:uuid.UUID,body:dict,_=Depends(check),session:AsyncSession=Depends(get_session))->dict:
    task=Task(workspace_id=workspace_id,title=body["title"],description=body.get("description"),owner_id=body.get("owner_id"),due_at=body.get("due_at"),priority=body.get("priority",3))
    session.add(task); await session.commit(); return serialize_task(task)
@router.get("/{workspace_id}/tasks/{task_id}")
async def task_detail(workspace_id:uuid.UUID,task_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->dict:
    task=await session.get(Task,task_id)
    if not task or task.workspace_id!=workspace_id: raise HTTPException(404,"Task not found")
    matches=(await session.execute(select(TaskActivityMatch).where(TaskActivityMatch.task_id==task.id))).scalars().all()
    dependencies=(await session.execute(select(TaskDependency).where(TaskDependency.task_id==task.id))).scalars().all()
    return {**serialize_task(task),"evidence":task.evidence,"dependencies":[str(x.depends_on_task_id) for x in dependencies],"github_matches":[{"activity_id":str(x.github_activity_id),"confidence":x.confidence,"reason":x.reason} for x in matches],"external_refs":task.external_refs}
@router.get("/{workspace_id}/meetings")
async def meetings(workspace_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(Meeting).where(Meeting.workspace_id==workspace_id).order_by(Meeting.started_at.desc().nulls_last()))).scalars().all()
    return [{"id":str(x.id),"title":x.title or "Untitled meeting","provider":x.provider.value,"status":x.status.value,"scheduled_at":x.scheduled_at,"started_at":x.started_at,"ended_at":x.ended_at} for x in rows]
@router.get("/{workspace_id}/meetings/{meeting_id}")
async def meeting_detail(workspace_id:uuid.UUID,meeting_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->dict:
    meeting=await session.get(Meeting,meeting_id)
    if not meeting or meeting.workspace_id!=workspace_id: raise HTTPException(404,"Meeting not found")
    transcript=(await session.execute(select(Transcript).where(Transcript.meeting_id==meeting.id))).scalar_one_or_none()
    extraction=(await session.execute(select(MeetingExtraction).where(MeetingExtraction.transcript_id==transcript.id))).scalar_one_or_none() if transcript else None
    chunks=(await session.execute(select(TranscriptChunk).where(TranscriptChunk.transcript_id==transcript.id).order_by(TranscriptChunk.sequence))).scalars().all() if transcript else []
    return {"id":str(meeting.id),"title":meeting.title or "Untitled meeting","provider":meeting.provider.value,"status":meeting.status.value,"started_at":meeting.started_at,"ended_at":meeting.ended_at,"transcript_id":str(transcript.id) if transcript else None,"extraction":{"status":extraction.status,"summary":extraction.summary,"confidence":extraction.confidence,"result":extraction.result,"error":extraction.error} if extraction else None,"chunks":[{"id":str(x.id),"text":x.text,"started_ms":x.started_ms,"ended_ms":x.ended_ms} for x in chunks]}
@router.get("/{workspace_id}/people")
async def people(workspace_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(User).join(WorkspaceMember,WorkspaceMember.user_id==User.id).where(WorkspaceMember.workspace_id==workspace_id))).scalars().all()
    return [{"id":str(x.id),"name":x.display_name,"email":x.email,"department":x.department,"avatar_url":x.avatar_url,"dashboard_access":x.is_login_enabled} for x in rows]
@router.get("/{workspace_id}/integrations")
async def integrations(workspace_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(Integration).where(Integration.workspace_id==workspace_id))).scalars().all()
    return [{"id":str(x.id),"provider":x.provider.value,"state":x.state.value,"config":x.config,"last_synced_at":x.last_synced_at} for x in rows]
@router.get("/{workspace_id}/insights")
async def insights(workspace_id:uuid.UUID,_=Depends(check),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(Insight).where(Insight.workspace_id==workspace_id).order_by(Insight.created_at.desc()).limit(30))).scalars().all()
    return [{"id":str(x.id),"key":x.key,"value":x.value,"confidence":x.confidence,"explanation":x.explanation,"created_at":x.created_at} for x in rows]
def serialize_task(task:Task)->dict:
    return {"id":str(task.id),"title":task.title,"description":task.description,"owner_id":str(task.owner_id) if task.owner_id else None,"state":task.state.value,"due_at":task.due_at,"execution_score":task.execution_score,"confidence":task.confidence,"last_activity_at":task.last_activity_at}
