import re
import uuid
import datetime
import jwt
import bcrypt
from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...api.deps import current_user, verified_claims
from ...config import settings
from ...db.session import get_session
from ...models.core import MemberRole, Organization, User, Workspace, WorkspaceMember

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_jwt(user_id: uuid.UUID) -> str:
    now = datetime.datetime.now(datetime.UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + datetime.timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class BootstrapRequest(BaseModel):
    display_name: str
    email: EmailStr


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    timezone: str | None = None
    notification_preferences: dict | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/signup")
async def signup(
    body: SignupRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    existing = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "An account with this email already exists")

    user = User(
        email=body.email,
        display_name=body.display_name,
        password_hash=_hash_password(body.password),
        is_login_enabled=True,
    )
    # Auto-grant platform admin if the email is in the bootstrap list
    admin_emails = {e.strip().lower() for e in settings.platform_admin_emails.split(",") if e.strip()}
    if user.email.lower() in admin_emails:
        user.is_platform_admin = True
    session.add(user)
    await session.flush()

    # Create a private owner workspace for the new user
    stem = re.sub(r"[^a-z0-9]+", "-", body.display_name.lower()).strip("-") or "workspace"
    slug = f"{stem}-{str(user.id)[:8]}"
    organization = Organization(name=f"{body.display_name}'s organization", slug=slug)
    session.add(organization)
    await session.flush()
    workspace = Workspace(
        organization_id=organization.id, name="Main workspace", slug="main"
    )
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id, user_id=user.id, role=MemberRole.OWNER
        )
    )
    await session.flush()

    # Create a 7-day trial subscription for the workspace
    from datetime import datetime, timedelta, UTC
    from ...models.subscription import Subscription, PlanTier, SubscriptionStatus
    now = datetime.now(UTC)
    sub = Subscription(
        workspace_id=workspace.id,
        plan=PlanTier.TRIAL,
        status=SubscriptionStatus.ACTIVE,
        trial_start=now,
        trial_end=now + timedelta(days=settings.trial_days),
    )
    session.add(sub)
    await session.flush()

    from ...services.escalation_rules import seed_default_rules
    await seed_default_rules(session, workspace.id)
    await session.commit()

    # Send welcome email if SMTP is configured (non-blocking — don't fail signup)
    if settings.smtp_host:
        try:
            from ...services.email import send_welcome_email, send_verification_email
            send_welcome_email(user.email, user.display_name)
            # Generate email verification token (24h expiry)
            now = datetime.datetime.now(datetime.UTC)
            verify_token = jwt.encode(
                {
                    "sub": str(user.id),
                    "purpose": "email_verification",
                    "iat": now,
                    "exp": now + datetime.timedelta(hours=24),
                },
                settings.jwt_secret_key,
                algorithm=settings.jwt_algorithm,
            )
            verify_link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={verify_token}"
            send_verification_email(user.email, user.display_name, verify_link)
        except Exception:
            import logging
            logging.exception("Failed to send welcome/verification email")

    token = _create_jwt(user.id)
    return {
        "token": token,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.display_name,
        },
    }


@router.post("/login")
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(401, "Invalid email or password")
    if not _verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_login_enabled or not user.is_active:
        raise HTTPException(403, "Account is disabled")

    token = _create_jwt(user.id)
    return {
        "token": token,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.display_name,
        },
    }


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Send a password reset email if the account exists.

    Always returns {"sent": True} to avoid leaking which emails are registered.
    The email is only sent if the user exists AND has a password set.
    """
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if not user or not user.password_hash:
        # Don't reveal whether the email exists — return success silently
        return {"sent": True}

    # Generate a short-lived reset token (1 hour)
    now = datetime.datetime.now(datetime.UTC)
    reset_token = jwt.encode(
        {
            "sub": str(user.id),
            "purpose": "password_reset",
            "iat": now,
            "exp": now + datetime.timedelta(hours=1),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={reset_token}"

    if settings.smtp_host:
        # Production — send the email
        from ...services.email import send_password_reset_email
        try:
            send_password_reset_email(user.email, user.display_name, reset_link)
        except Exception:
            # Log but don't leak the error to the client
            import logging
            logging.exception("Failed to send password reset email")
            raise HTTPException(500, "Failed to send reset email. Please try again.")
        return {"sent": True}
    else:
        # Dev mode — no SMTP configured. Return the token so the frontend
        # can show a dev reset form. In production this branch won't run.
        return {"sent": True, "reset_token": reset_token, "dev_mode": True}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Reset password using a valid reset token."""
    try:
        payload = jwt.decode(
            body.token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(400, "Reset link has expired. Please request a new one.")
    except jwt.PyJWTError:
        raise HTTPException(400, "Invalid reset token")
    if payload.get("purpose") != "password_reset":
        raise HTTPException(400, "Invalid reset token")
    user = (
        await session.execute(
            select(User).where(User.id == payload["sub"])
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if not user.is_active:
        raise HTTPException(403, "Account is disabled")
    user.password_hash = _hash_password(body.password)
    await session.commit()
    return {"reset": True}


@router.post("/verify-email")
async def verify_email(
    body: VerifyEmailRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Verify an email address using a verification token."""
    try:
        payload = jwt.decode(
            body.token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(400, "Verification link has expired. Please request a new one.")
    except jwt.PyJWTError:
        raise HTTPException(400, "Invalid verification token")
    if payload.get("purpose") != "email_verification":
        raise HTTPException(400, "Invalid verification token")
    user = (
        await session.execute(
            select(User).where(User.id == payload["sub"])
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if not user.is_active:
        raise HTTPException(403, "Account is disabled")
    if user.is_email_verified:
        return {"verified": True, "already": True}
    user.is_email_verified = True
    await session.commit()
    return {"verified": True}


@router.post("/resend-verification")
async def resend_verification(
    body: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Resend email verification link. Always returns success to avoid leaking registrations."""
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if not user or user.is_email_verified:
        return {"sent": True}

    if settings.smtp_host:
        try:
            from ...services.email import send_verification_email
            now = datetime.datetime.now(datetime.UTC)
            verify_token = jwt.encode(
                {
                    "sub": str(user.id),
                    "purpose": "email_verification",
                    "iat": now,
                    "exp": now + datetime.timedelta(hours=24),
                },
                settings.jwt_secret_key,
                algorithm=settings.jwt_algorithm,
            )
            verify_link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={verify_token}"
            send_verification_email(user.email, user.display_name, verify_link)
        except Exception:
            import logging
            logging.exception("Failed to resend verification email")
            raise HTTPException(500, "Failed to send verification email. Please try again.")
    return {"sent": True}


@router.get("/me")
async def me(
    user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    rows = (
        await session.execute(
            select(Workspace, WorkspaceMember)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id)
        )
    ).all()
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.display_name,
        "is_email_verified": user.is_email_verified,
        "is_platform_admin": user.is_platform_admin,
        "notification_preferences": user.notification_preferences,
        "workspaces": [
            {
                "id": str(workspace.id),
                "name": workspace.name,
                "slug": workspace.slug,
                "role": member.role.value,
            }
            for workspace, member in rows
        ],
    }


@router.get("/me/subscription")
async def my_subscription(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return subscription status for the user's first workspace.

    The frontend uses this to decide whether to show the billing wall
    or the normal app.
    """
    from ...services.billing import check_access
    # Find the user's first workspace
    rows = (
        await session.execute(
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id)
            .limit(1)
        )
    ).scalars().all()
    if not rows:
        return {
            "allowed": True,  # no workspace yet — let them create one
            "plan": "trial",
            "status": "active",
            "trial_end": None,
            "paid_until": None,
            "days_remaining": 0,
            "is_platform_admin": user.is_platform_admin,
        }
    return await check_access(session, rows[0].id, user)


@router.post("/bootstrap")
async def bootstrap(
    body: BootstrapRequest,
    claims: dict = Depends(verified_claims),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Legacy endpoint for Clerk-based bootstrap. Kept for backward compat."""
    user = (
        await session.execute(select(User).where(User.clerk_id == claims["sub"]))
    ).scalar_one_or_none()
    if not user:
        user = User(
            clerk_id=claims["sub"],
            email=body.email,
            display_name=body.display_name,
            is_login_enabled=True,
        )
        session.add(user)
        await session.commit()
    if user.email != body.email:
        raise HTTPException(400, "Authenticated identity email mismatch")
    membership = (
        await session.execute(
            select(WorkspaceMember).where(WorkspaceMember.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not membership:
        stem = (
            re.sub(r"[^a-z0-9]+", "-", body.display_name.lower()).strip("-")
            or "workspace"
        )
        slug = f"{stem}-{str(user.id)[:8]}"
        organization = Organization(
            name=f"{body.display_name}'s organization", slug=slug
        )
        session.add(organization)
        await session.flush()
        workspace = Workspace(
            organization_id=organization.id, name="Main workspace", slug="main"
        )
        session.add(workspace)
        await session.flush()
        session.add(
            WorkspaceMember(
                workspace_id=workspace.id, user_id=user.id, role=MemberRole.OWNER
            )
        )
        await session.flush()
        from ...services.escalation_rules import seed_default_rules
        await seed_default_rules(session, workspace.id)
        await session.commit()
    return {"user_id": str(user.id), "onboarding_required": False}


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await session.commit()
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "timezone": user.timezone,
        "notification_preferences": user.notification_preferences,
    }


@router.post("/logout")
async def logout() -> dict:
    """Stateless JWT — client just discards the token."""
    return {"revoked": True}
