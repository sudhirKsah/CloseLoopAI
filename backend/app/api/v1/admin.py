"""Platform admin API — manage users, workspaces, and subscriptions.

All endpoints require ``is_platform_admin=True`` on the authenticated user.
"""
import uuid
from datetime import datetime, UTC, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.deps import current_user, require_platform_admin
from ...config import settings
from ...db.session import get_session
from ...models.core import User, Workspace, WorkspaceMember, MemberRole
from ...models.subscription import (
    Subscription,
    PlanTier,
    SubscriptionStatus,
)
from ...services.billing import (
    check_access,
    extend_trial,
    grant_plan,
    revoke_access,
    get_subscription,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _workspace_summary(session: AsyncSession, ws: Workspace, sub: Subscription | None) -> dict:
    owner = (
        await session.execute(
            select(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.role == MemberRole.OWNER,
            )
        )
    ).scalar_one_or_none()
    owner_user = (
        await session.execute(select(User).where(User.id == owner.user_id))
        if owner else None
    )
    owner_user = owner_user.scalar_one_or_none() if owner_user else None
    member_count = (
        await session.execute(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == ws.id)
        )
    ).scalar_one()
    now = datetime.now(UTC)
    return {
        "workspace_id": str(ws.id),
        "workspace_name": ws.name,
        "owner_email": owner_user.email if owner_user else None,
        "owner_name": owner_user.display_name if owner_user else None,
        "member_count": member_count,
        "plan": sub.plan.value if sub else "trial",
        "status": sub.status.value if sub else "active",
        "trial_start": sub.trial_start.isoformat() if sub and sub.trial_start else None,
        "trial_end": sub.trial_end.isoformat() if sub and sub.trial_end else None,
        "paid_until": sub.paid_until.isoformat() if sub and sub.paid_until else None,
        "days_remaining": max(0, (sub.trial_end - now).days) if sub and sub.plan == PlanTier.TRIAL else (
            max(0, (sub.paid_until - now).days) if sub and sub.paid_until else (
                9999 if sub and sub.plan == PlanTier.LIFETIME else 0
            )
        ),
        "is_active": sub.status == SubscriptionStatus.ACTIVE if sub else False,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/users")
async def list_users(
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """List all users with their admin status."""
    total = (
        await session.execute(select(func.count()).select_from(User))
    ).scalar_one()
    rows = (
        await session.execute(
            select(User)
            .order_by(User.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return {
        "total": total,
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "display_name": u.display_name,
                "is_platform_admin": u.is_platform_admin,
                "is_active": u.is_active,
                "is_email_verified": u.is_email_verified,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in rows
        ],
    }


@router.get("/workspaces")
async def list_workspaces(
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """List all workspaces with subscription summary."""
    total = (
        await session.execute(select(func.count()).select_from(Workspace))
    ).scalar_one()
    workspaces = (
        await session.execute(
            select(Workspace)
            .order_by(Workspace.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    result = []
    for ws in workspaces:
        sub = await get_subscription(session, ws.id)
        result.append(await _workspace_summary(session, ws, sub))

    return {"total": total, "workspaces": result}


class ExtendTrialRequest(BaseModel):
    days: int = Field(..., gt=0, le=365, description="Days to extend")
    notes: str | None = Field(None, max_length=500)


class GrantPlanRequest(BaseModel):
    plan: PlanTier
    days: int = Field(30, gt=0, le=3650, description="Days for paid plans")
    notes: str | None = Field(None, max_length=500)


class RevokeRequest(BaseModel):
    notes: str | None = Field(None, max_length=500)


@router.post("/workspaces/{workspace_id}/extend-trial")
async def admin_extend_trial(
    workspace_id: uuid.UUID,
    body: ExtendTrialRequest,
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Extend a workspace's trial by N days."""
    try:
        sub = await extend_trial(session, workspace_id, body.days, body.notes)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {
        "workspace_id": str(workspace_id),
        "plan": sub.plan.value,
        "status": sub.status.value,
        "trial_end": sub.trial_end.isoformat(),
        "notes": sub.notes,
    }


@router.post("/workspaces/{workspace_id}/grant-plan")
async def admin_grant_plan(
    workspace_id: uuid.UUID,
    body: GrantPlanRequest,
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Grant a paid plan (or lifetime) to a workspace."""
    sub = await grant_plan(session, workspace_id, body.plan, body.days, body.notes)
    return {
        "workspace_id": str(workspace_id),
        "plan": sub.plan.value,
        "status": sub.status.value,
        "paid_until": sub.paid_until.isoformat() if sub.paid_until else None,
        "notes": sub.notes,
    }


@router.post("/workspaces/{workspace_id}/revoke")
async def admin_revoke(
    workspace_id: uuid.UUID,
    body: RevokeRequest,
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Revoke a workspace's access."""
    try:
        sub = await revoke_access(session, workspace_id, body.notes)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {
        "workspace_id": str(workspace_id),
        "plan": sub.plan.value,
        "status": sub.status.value,
        "notes": sub.notes,
    }


@router.post("/users/{user_id}/toggle-admin")
async def toggle_platform_admin(
    user_id: uuid.UUID,
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Toggle is_platform_admin for a user."""
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_platform_admin = not user.is_platform_admin
    await session.commit()
    return {
        "user_id": str(user.id),
        "email": user.email,
        "is_platform_admin": user.is_platform_admin,
    }


@router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: uuid.UUID,
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Enable/disable a user's login access."""
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = not user.is_active
    await session.commit()
    return {
        "user_id": str(user.id),
        "email": user.email,
        "is_active": user.is_active,
    }


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

class SendEmailRequest(BaseModel):
    to: str = Field(..., description="Recipient email address")
    subject: str = Field(..., max_length=200)
    body: str = Field(..., max_length=10000, description="Email body (HTML allowed)")


class BroadcastEmailRequest(BaseModel):
    subject: str = Field(..., max_length=200)
    body: str = Field(..., max_length=10000, description="Email body (HTML allowed)")
    only_active: bool = Field(True, description="Only send to active users")


@router.post("/send-email")
async def admin_send_email(
    body: SendEmailRequest,
    _admin: User = Depends(require_platform_admin),
) -> dict:
    """Send an email to a single recipient from the admin panel."""
    from ...services.email import send_admin_email
    try:
        send_admin_email(body.to, body.subject, body.body)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Failed to send email: {exc}")
    return {"sent": True, "to": body.to, "subject": body.subject}


@router.post("/broadcast-email")
async def admin_broadcast_email(
    body: BroadcastEmailRequest,
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Send an email to all users (or all active users)."""
    from ...services.email import send_admin_email
    query = select(User)
    if body.only_active:
        query = query.where(User.is_active.is_(True))
    users = (await session.execute(query)).scalars().all()
    sent = 0
    failed = 0
    errors = []
    for u in users:
        try:
            send_admin_email(u.email, body.subject, body.body)
            sent += 1
        except Exception:
            failed += 1
            errors.append(u.email)
    return {"sent": sent, "failed": failed, "errors": errors[:10]}


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------

@router.get("/payments")
async def list_all_payments(
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """List all payments across all workspaces."""
    from ...models.payment import Payment, PaymentOrder
    total = (
        await session.execute(select(func.count()).select_from(Payment))
    ).scalar_one()
    rows = (
        await session.execute(
            select(Payment, Workspace)
            .join(Workspace, Workspace.id == Payment.workspace_id)
            .order_by(Payment.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return {
        "total": total,
        "payments": [
            {
                "id": str(p.id),
                "workspace_id": str(p.workspace_id),
                "workspace_name": ws.name,
                "razorpay_payment_id": p.razorpay_payment_id,
                "razorpay_order_id": p.razorpay_order_id,
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status,
                "method": p.method,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p, ws in rows
        ],
    }


@router.get("/orders")
async def list_all_orders(
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """List all payment orders across all workspaces."""
    from ...models.payment import PaymentOrder
    total = (
        await session.execute(select(func.count()).select_from(PaymentOrder))
    ).scalar_one()
    rows = (
        await session.execute(
            select(PaymentOrder, Workspace, User)
            .join(Workspace, Workspace.id == PaymentOrder.workspace_id)
            .join(User, User.id == PaymentOrder.user_id)
            .order_by(PaymentOrder.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return {
        "total": total,
        "orders": [
            {
                "id": str(o.id),
                "workspace_id": str(o.workspace_id),
                "workspace_name": ws.name,
                "user_email": u.email,
                "razorpay_order_id": o.razorpay_order_id,
                "amount": o.amount,
                "currency": o.currency,
                "status": o.status,
                "description": o.description,
                "customer_name": o.customer_name,
                "customer_email": o.customer_email,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o, ws, u in rows
        ],
    }


@router.get("/payments/summary")
async def payments_summary(
    _admin: User = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Revenue summary across all workspaces."""
    from ...models.payment import Payment
    # Total captured revenue
    total_revenue = (
        await session.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.status == "captured")
        )
    ).scalar_one()
    # Count by status
    status_counts = (
        await session.execute(
            select(Payment.status, func.count())
            .group_by(Payment.status)
        )
    ).all()
    # Count by method
    method_counts = (
        await session.execute(
            select(Payment.method, func.count(), func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.status == "captured")
            .group_by(Payment.method)
        )
    ).all()
    return {
        "total_revenue_paise": total_revenue,
        "total_revenue_display": f"₹{total_revenue / 100:,.2f}" if total_revenue else "₹0.00",
        "status_counts": {s: c for s, c in status_counts},
        "method_counts": [
            {"method": m or "unknown", "count": c, "amount_paise": a}
            for m, c, a in method_counts
        ],
    }
