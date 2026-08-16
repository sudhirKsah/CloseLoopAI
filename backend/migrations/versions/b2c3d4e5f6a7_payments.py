"""payments

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_orders",
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=64), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("customer_name", sa.String(length=200), nullable=True),
        sa.Column("customer_email", sa.String(length=200), nullable=True),
        sa.Column("customer_contact", sa.String(length=20), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_payment_orders_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_payment_orders_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_orders")),
        sa.UniqueConstraint("razorpay_order_id", name=op.f("uq_payment_orders_razorpay_order_id")),
    )
    op.create_index(
        "ix_payment_orders_workspace",
        "payment_orders",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_payment_orders_razorpay_order",
        "payment_orders",
        ["razorpay_order_id"],
        unique=False,
    )

    op.create_table(
        "payments",
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("razorpay_payment_id", sa.String(length=64), nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=64), nullable=False),
        sa.Column("razorpay_signature", sa.Text(), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["payment_orders.id"],
            name=op.f("fk_payments_order_id_payment_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_payments_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("razorpay_payment_id", name=op.f("uq_payments_razorpay_payment_id")),
    )
    op.create_index(
        "ix_payments_workspace",
        "payments",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_payments_razorpay_payment",
        "payments",
        ["razorpay_payment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_payments_razorpay_payment", table_name="payments")
    op.drop_index("ix_payments_workspace", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_payment_orders_razorpay_order", table_name="payment_orders")
    op.drop_index("ix_payment_orders_workspace", table_name="payment_orders")
    op.drop_table("payment_orders")
