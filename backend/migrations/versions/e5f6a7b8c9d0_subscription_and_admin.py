"""add workspace_subscriptions table and is_platform_admin to users

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. is_platform_admin on users
    op.add_column(
        "users",
        sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 2. workspace_subscriptions table
    op.create_table(
        "workspace_subscriptions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                  unique=True, nullable=False),
        sa.Column("plan", sa.Enum("trial", "monthly", "yearly", "lifetime", "expired", name="plan_tier"),
                  nullable=False, server_default="trial"),
        sa.Column("status",
                  sa.Enum("active", "past_due", "canceled", "expired", name="subscription_status"),
                  nullable=False, server_default="active"),
        sa.Column("trial_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("trial_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_subscriptions_workspace", "workspace_subscriptions", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_subscriptions_workspace", table_name="workspace_subscriptions")
    op.drop_table("workspace_subscriptions")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS plan_tier")
    op.drop_column("users", "is_platform_admin")
