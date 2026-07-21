import uuid
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ...api.deps import require_workspace_admin
from ...db.session import get_session
from ...models.core import Workspace
router=APIRouter(prefix="/settings",tags=["settings"])
class WorkspaceSettingsUpdate(BaseModel):
    name:str|None=None
    settings:dict=Field(default_factory=dict)
@router.get("/workspaces/{workspace_id}")
async def workspace_settings(workspace_id:uuid.UUID,_=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->dict:
    workspace=await session.get(Workspace,workspace_id)
    if not workspace: raise HTTPException(404,"Workspace not found")
    return {"id":str(workspace.id),"name":workspace.name,"slug":workspace.slug,"settings":workspace.settings}
@router.patch("/workspaces/{workspace_id}")
async def update_workspace_settings(workspace_id:uuid.UUID,body:WorkspaceSettingsUpdate,_=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->dict:
    workspace=await session.get(Workspace,workspace_id)
    if not workspace: raise HTTPException(404,"Workspace not found")
    if body.name: workspace.name=body.name
    workspace.settings={**workspace.settings,**body.settings}; await session.commit()
    return {"id":str(workspace.id),"name":workspace.name,"settings":workspace.settings}
