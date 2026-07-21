import httpx
import re
from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...api.deps import current_user, verified_claims
from ...config import settings
from ...db.session import get_session
from ...models.core import MemberRole, Organization, User, Workspace, WorkspaceMember
router=APIRouter(prefix="/auth",tags=["auth"])
class BootstrapRequest(BaseModel): display_name:str; email:EmailStr
class ProfileUpdate(BaseModel): display_name:str|None=None; avatar_url:str|None=None; timezone:str|None=None; notification_preferences:dict|None=None
@router.get("/me")
async def me(user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->dict:
    rows=(await session.execute(select(Workspace,WorkspaceMember).join(WorkspaceMember,WorkspaceMember.workspace_id==Workspace.id).where(WorkspaceMember.user_id==user.id))).all()
    return {"id":str(user.id),"email":user.email,"name":user.display_name,"workspaces":[{"id":str(workspace.id),"name":workspace.name,"slug":workspace.slug,"role":member.role.value} for workspace,member in rows]}
@router.post("/bootstrap")
async def bootstrap(body:BootstrapRequest,claims:dict=Depends(verified_claims),session:AsyncSession=Depends(get_session))->dict:
    user=(await session.execute(select(User).where(User.clerk_id==claims["sub"]))).scalar_one_or_none()
    if not user:
        user=User(clerk_id=claims["sub"],email=body.email,display_name=body.display_name,is_login_enabled=True); session.add(user); await session.commit()
    if user.email!=body.email: raise HTTPException(400,"Authenticated identity email mismatch")
    membership=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if not membership:
        # Each new account starts with a private owner workspace. Directory records
        # from integrations do not become dashboard members.
        stem=re.sub(r"[^a-z0-9]+", "-", body.display_name.lower()).strip("-") or "workspace"
        slug=f"{stem}-{str(user.id)[:8]}"
        organization=Organization(name=f"{body.display_name}'s organization",slug=slug)
        session.add(organization); await session.flush()
        workspace=Workspace(organization_id=organization.id,name="Main workspace",slug="main")
        session.add(workspace); await session.flush()
        session.add(WorkspaceMember(workspace_id=workspace.id,user_id=user.id,role=MemberRole.OWNER))
        await session.commit()
    return {"user_id":str(user.id),"onboarding_required":False}
@router.patch("/profile")
async def update_profile(body:ProfileUpdate,user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->dict:
    for field,value in body.model_dump(exclude_none=True).items(): setattr(user,field,value)
    await session.commit(); return {"id":str(user.id),"display_name":user.display_name,"timezone":user.timezone,"notification_preferences":user.notification_preferences}
@router.post("/email/sync")
async def sync_verified_email(body:BootstrapRequest,claims:dict=Depends(verified_claims),session:AsyncSession=Depends(get_session))->dict:
    """Called only after Clerk completes its email verification/change flow."""
    user=(await session.execute(select(User).where(User.clerk_id==claims["sub"]))).scalar_one_or_none()
    if not user: raise HTTPException(404,"Local account not found")
    user.email=body.email; await session.commit(); return {"email":user.email}
@router.post("/logout")
async def logout(claims:dict=Depends(verified_claims))->dict:
    session_id=claims.get("sid")
    if not session_id: return {"revoked":False,"message":"Clear the client session with Clerk signOut()."}
    if not settings.clerk_secret_key: raise HTTPException(503,"Clerk backend key is not configured")
    async with httpx.AsyncClient() as client:
        response=await client.post(f"https://api.clerk.com/v1/sessions/{session_id}/revoke",headers={"Authorization":f"Bearer {settings.clerk_secret_key}"}); response.raise_for_status()
    return {"revoked":True}
