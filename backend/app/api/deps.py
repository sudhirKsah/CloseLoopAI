import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..db.session import get_session
from ..models.core import User, WorkspaceMember
async def verified_claims(request:Request)->dict:
    header=request.headers.get("authorization","")
    if not header.startswith("Bearer "): raise HTTPException(401,"Missing bearer token")
    if not settings.clerk_jwks_url or not settings.clerk_issuer: raise HTTPException(503,"Clerk auth is not configured")
    try:
        key=jwt.PyJWKClient(settings.clerk_jwks_url).get_signing_key_from_jwt(header[7:]).key
        return jwt.decode(header[7:],key,algorithms=["RS256"],issuer=settings.clerk_issuer,audience=settings.clerk_audience or None)
    except jwt.PyJWTError as error: raise HTTPException(401,"Invalid authentication token") from error
async def current_user(claims:dict=Depends(verified_claims),session:AsyncSession=Depends(get_session))->User:
    user=(await session.execute(select(User).where(User.clerk_id==claims["sub"],User.is_login_enabled.is_(True),User.is_active.is_(True)))).scalar_one_or_none()
    if not user: raise HTTPException(403,"No CloseLoop dashboard access")
    return user
async def require_workspace_admin(workspace_id:str,user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->User:
    member=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==workspace_id,WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if not member or member.role.value not in ("owner","admin"): raise HTTPException(403,"Workspace administrator access required")
    return user
