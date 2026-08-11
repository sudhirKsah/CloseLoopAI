import datetime
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..db.session import get_session
from ..models.core import User, WorkspaceMember


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
        raise HTTPException(403, "No CloseLoop dashboard access")
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
