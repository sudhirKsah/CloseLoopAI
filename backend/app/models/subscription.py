"""Workspace subscription / billing model.

Each workspace has at most one Subscription row that tracks the current
plan, trial window, and paid-through date.  The platform admin can
manually extend or grant access before the payment gateway is wired up.
"""
import enum, uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from ..db.base import Base, Timestamped, UUIDPrimaryKey


class PlanTier(str, enum.Enum):
    TRIAL = "trial"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    LIFETIME = "lifetime"      # granted manually by admin
    EXPIRED = "expired"        # trial ended and no payment received


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"          # within trial or paid period
    PAST_DUE = "past_due"      # trial ended, grace period
    CANCELED = "canceled"      # admin revoked access
    EXPIRED = "expired"        # fully expired


class Subscription(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "workspace_subscriptions"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    plan: Mapped[PlanTier] = mapped_column(
        Enum(PlanTier, name="plan_tier", values_callable=lambda e: [m.value for m in e]),
        default=PlanTier.TRIAL,
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status", values_callable=lambda e: [m.value for m in e]),
        default=SubscriptionStatus.ACTIVE,
        nullable=False,
    )
    trial_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    trial_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # When a paid plan is active, paid_until is the end of the current
    # billing period.  For trial/lifetime it can be NULL.
    paid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Admin notes — e.g. "extended by 7 days for demo"
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (
        Index("ix_subscriptions_workspace", "workspace_id"),
    )
