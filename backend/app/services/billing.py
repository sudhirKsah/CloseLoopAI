"""Subscription / billing helpers.

Centralises the logic for:
- Looking up a workspace's subscription
- Deciding whether access is currently allowed
- Computing days remaining in the trial
- Letting platform admins extend / revoke access
"""
from datetime import datetime, UTC, timedelta
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.core import User, WorkspaceMember, MemberRole
from ..models.subscription import (
    Subscription,
    PlanTier,
    SubscriptionStatus,
)


async def get_subscription(
    session: AsyncSession, workspace_id: uuid.UUID
) -> Subscription | None:
    """Return the subscription row for *workspace_id* or None."""
    return (
        await session.execute(
            select(Subscription).where(Subscription.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()


def _is_active(sub: Subscription | None, now: datetime | None = None) -> bool:
    """Pure function — is this subscription currently granting access?"""
    if sub is None:
        return False
    now = now or datetime.now(UTC)

    # Admin-granted lifetime or canceled
    if sub.status == SubscriptionStatus.CANCELED:
        return False
    if sub.plan == PlanTier.LIFETIME and sub.status == SubscriptionStatus.ACTIVE:
        return True

    # Paid plan — check paid_until
    if sub.plan in (PlanTier.MONTHLY, PlanTier.YEARLY):
        if sub.paid_until and sub.paid_until > now:
            return True
        # Paid period ended — fall through to trial check, then deny
        if sub.paid_until and sub.paid_until <= now:
            return False

    # Trial
    if sub.plan == PlanTier.TRIAL:
        return sub.trial_end > now

    return False


async def check_access(
    session: AsyncSession, workspace_id: uuid.UUID, user: User
) -> dict:
    """Return an access summary dict.

    Keys:
      allowed: bool
      plan: str
      status: str
      trial_end: str | None
      days_remaining: int
      is_platform_admin: bool
    """
    sub = await get_subscription(session, workspace_id)
    now = datetime.now(UTC)
    allowed = _is_active(sub, now)

    # Platform admins always have access (for support / demo purposes)
    if user.is_platform_admin:
        allowed = True

    days_remaining = 0
    trial_end_iso = None
    if sub:
        if sub.plan == PlanTier.TRIAL:
            delta = sub.trial_end - now
            days_remaining = max(0, delta.days)
            trial_end_iso = sub.trial_end.isoformat()
        elif sub.plan in (PlanTier.MONTHLY, PlanTier.YEARLY) and sub.paid_until:
            delta = sub.paid_until - now
            days_remaining = max(0, delta.days)
        elif sub.plan == PlanTier.LIFETIME:
            days_remaining = 9999

    return {
        "allowed": allowed,
        "plan": sub.plan.value if sub else "trial",
        "status": sub.status.value if sub else "active",
        "trial_end": trial_end_iso,
        "paid_until": sub.paid_until.isoformat() if sub and sub.paid_until else None,
        "days_remaining": days_remaining,
        "is_platform_admin": user.is_platform_admin,
    }


async def extend_trial(
    session: AsyncSession, workspace_id: uuid.UUID, extra_days: int, notes: str | None = None
) -> Subscription:
    """Extend a workspace's trial by *extra_days* (admin action)."""
    sub = await get_subscription(session, workspace_id)
    if not sub:
        raise ValueError("No subscription for this workspace")
    now = datetime.now(UTC)
    # Extend from the later of now or current trial_end
    base = max(sub.trial_end, now)
    sub.trial_end = base + timedelta(days=extra_days)
    if sub.status == SubscriptionStatus.EXPIRED or sub.status == SubscriptionStatus.PAST_DUE:
        sub.status = SubscriptionStatus.ACTIVE
    if sub.plan == PlanTier.EXPIRED:
        sub.plan = PlanTier.TRIAL
    if notes:
        sub.notes = notes
    await session.commit()
    await session.refresh(sub)
    return sub


async def grant_plan(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    plan: PlanTier,
    days: int = 30,
    notes: str | None = None,
) -> Subscription:
    """Grant a paid plan (or lifetime) to a workspace (admin action)."""
    sub = await get_subscription(session, workspace_id)
    if not sub:
        sub = Subscription(
            workspace_id=workspace_id,
            plan=plan,
            status=SubscriptionStatus.ACTIVE,
            trial_start=datetime.now(UTC),
            trial_end=datetime.now(UTC) + timedelta(days=settings.trial_days),
        )
        session.add(sub)
    sub.plan = plan
    sub.status = SubscriptionStatus.ACTIVE
    if plan == PlanTier.LIFETIME:
        sub.paid_until = None
    else:
        sub.paid_until = datetime.now(UTC) + timedelta(days=days)
    if notes:
        sub.notes = notes
    await session.commit()
    await session.refresh(sub)
    return sub


async def revoke_access(
    session: AsyncSession, workspace_id: uuid.UUID, notes: str | None = None
) -> Subscription:
    """Revoke a workspace's access (admin action)."""
    sub = await get_subscription(session, workspace_id)
    if not sub:
        raise ValueError("No subscription for this workspace")
    sub.status = SubscriptionStatus.CANCELED
    if notes:
        sub.notes = notes
    await session.commit()
    await session.refresh(sub)
    return sub
