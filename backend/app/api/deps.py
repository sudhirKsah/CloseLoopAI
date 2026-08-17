import datetime
import uuid
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..db.session import get_session
from ..models.core import User, WorkspaceMember
from ..services.billing import check_access


def _decode_custom_jwt(token: str) -> dict | None:
    """Try to decode a custom HS256 JWT. Returns None if not a custom token."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError:
        return None


def _decode_clerk_jwt(token: str) -> dict | None:
    """Try to decode a Clerk RS256 JWT. Returns None if not a Clerk token."""
    if not settings.clerk_jwks_url or not settings.clerk_issuer:
        return None
    try:
        key = (
            jwt.PyJWKClient(settings.clerk_jwks_url)
            .get_signing_key_from_jwt(token)
            .key
        )
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            audience=settings.clerk_audience or None,
        )
    except jwt.PyJWTError:
        return None


async def verified_claims(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = header[7:]
    # Try custom JWT first, then fall back to Clerk
    claims = _decode_custom_jwt(token)
    if claims is None:
        claims = _decode_clerk_jwt(token)
    if claims is None:
        raise HTTPException(401, "Invalid authentication token")
    return claims


async def current_user(
    claims: dict = Depends(verified_claims),
    session: AsyncSession = Depends(get_session),
) -> User:
    # Custom JWT uses "sub" = user UUID, Clerk uses "sub" = clerk_id
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "Invalid token payload")

    # Try by ID first (custom JWT stores user UUID in sub)
    user = (
        await session.execute(
            select(User).where(
                User.id == sub,
                User.is_login_enabled.is_(True),
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    # Fall back to clerk_id lookup (Clerk JWT)
    if not user:
        user = (
            await session.execute(
                select(User).where(
                    User.clerk_id == sub,
                    User.is_login_enabled.is_(True),
                    User.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()

    if not user:
        raise HTTPException(403, "No Pathayo dashboard access")
    return user


async def require_workspace_admin(
    workspace_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    member = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not member or member.role.value not in ("owner", "admin"):
        raise HTTPException(403, "Workspace administrator access required")
    return user


async def require_platform_admin(
    user: User = Depends(current_user),
) -> User:
    """Dependency that only passes for platform-level admins."""
    if not user.is_platform_admin:
        raise HTTPException(403, "Platform admin access required")
    return user


async def require_subscription(
    request: Request,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Dependency that checks the active workspace's subscription status.

    Extracts the workspace_id from the URL path parameter
    ``workspace_id`` and returns the access summary dict.  If access is
    denied, raises 402 Payment Required so the frontend can show the
    billing wall.
    """
    # Platform admins bypass the check
    if user.is_platform_admin:
        return {"allowed": True, "is_platform_admin": True, "plan": "lifetime",
                "status": "active", "trial_end": None, "paid_until": None,
                "days_remaining": 9999}

    # Extract workspace_id from path params
    workspace_id_str = request.path_params.get("workspace_id")
    if not workspace_id_str:
        # No workspace in path — allow through (e.g. /me endpoints)
        return {"allowed": True, "is_platform_admin": False, "plan": "trial",
                "status": "active", "trial_end": None, "paid_until": None,
                "days_remaining": 0}

    try:
        workspace_id = uuid.UUID(str(workspace_id_str))
    except (ValueError, TypeError):
        return {"allowed": True, "is_platform_admin": False, "plan": "trial",
                "status": "active", "trial_end": None, "paid_until": None,
                "days_remaining": 0}

    access = await check_access(session, workspace_id, user)
    if not access["allowed"]:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "Your free trial has ended. Subscribe to continue using Pathayo.",
                "plan": access["plan"],
                "status": access["status"],
                "trial_end": access["trial_end"],
            },
        )
    return access
