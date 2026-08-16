"""Payment API routes — Razorpay integration.

Flow:
1. Frontend calls POST /payments/create-order to create a Razorpay order
2. Frontend opens Razorpay checkout with the order_id + key_id
3. User pays on Razorpay checkout (UPI/card/netbanking)
4. Razorpay sends the payment_id + signature back to the frontend
5. Frontend calls POST /payments/verify to verify the signature and store the payment
6. (Optional) Razorpay also sends a webhook to /payments/webhook for server-side confirmation

All routes are workspace-scoped and require authentication.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.deps import current_user
from ...config import settings
from ...db.session import get_session
from ...models.core import User, WorkspaceMember
from ...models.payment import Payment, PaymentOrder
from ...services import payments as payment_service

router = APIRouter(prefix="/workspaces/{workspace_id}/payments", tags=["payments"])


async def _require_member(
    workspace_id: uuid.UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceMember:
    member = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreateOrderRequest(BaseModel):
    amount: int = Field(..., gt=0, description="Amount in smallest currency unit (paise for INR, cents for USD). e.g. ₹100 = 10000")
    currency: str = Field("INR", max_length=8, description="Currency code: INR, USD, etc.")
    description: str | None = Field(None, max_length=500)
    customer_name: str | None = Field(None, max_length=200)
    customer_email: str | None = Field(None, max_length=200)
    customer_contact: str | None = Field(None, max_length=20)
    notes: dict[str, str] | None = None


class OrderResponse(BaseModel):
    id: str
    razorpay_order_id: str
    amount: int
    currency: str
    status: str
    key_id: str  # Razorpay public key for frontend checkout
    description: str | None = None


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentResponse(BaseModel):
    id: str
    razorpay_payment_id: str
    razorpay_order_id: str
    amount: int
    currency: str
    status: str
    method: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_payment_config(
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
) -> dict:
    """Check if Razorpay is configured and return the public key for checkout."""
    return {
        "configured": payment_service.is_configured(),
        "key_id": settings.razorpay_key_id or "",
        "currency": settings.razorpay_currency,
    }


@router.post("/create-order", response_model=OrderResponse)
async def create_order(
    body: CreateOrderRequest,
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(_require_member),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> OrderResponse:
    """Create a Razorpay order. Returns the order_id and key_id needed
    to open the Razorpay checkout on the frontend."""
    if not payment_service.is_configured():
        raise HTTPException(
            503,
            "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the backend .env file. "
            "Get test keys from https://dashboard.razorpay.com/app/keys",
        )

    try:
        order = payment_service.create_order(
            amount=body.amount,
            currency=body.currency,
            description=body.description,
            customer_name=body.customer_name,
            customer_email=body.customer_email,
            customer_contact=body.customer_contact,
            notes=body.notes,
        )
    except payment_service.PaymentError as exc:
        raise HTTPException(exc.status_code, str(exc))

    # Store the order in our database
    db_order = PaymentOrder(
        workspace_id=workspace_id,
        user_id=user.id,
        razorpay_order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        status=order["status"],
        description=body.description,
        customer_name=body.customer_name,
        customer_email=body.customer_email,
        customer_contact=body.customer_contact,
        metadata_=body.notes,
    )
    session.add(db_order)
    await session.commit()
    await session.refresh(db_order)

    return OrderResponse(
        id=str(db_order.id),
        razorpay_order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        status=order["status"],
        key_id=settings.razorpay_key_id,
        description=body.description,
    )


@router.post("/verify", response_model=PaymentResponse)
async def verify_payment(
    body: VerifyPaymentRequest,
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(_require_member),
    session: AsyncSession = Depends(get_session),
) -> PaymentResponse:
    """Verify a Razorpay payment signature and store the payment.

    Called by the frontend after the Razorpay checkout completes.
    This confirms the payment is genuine and records it in the database.
    """
    if not payment_service.is_configured():
        raise HTTPException(503, "Razorpay is not configured")

    # Find the order in our database
    db_order = (
        await session.execute(
            select(PaymentOrder).where(
                PaymentOrder.workspace_id == workspace_id,
                PaymentOrder.razorpay_order_id == body.razorpay_order_id,
            )
        )
    ).scalar_one_or_none()

    if not db_order:
        raise HTTPException(404, "Order not found")

    # Verify the signature
    is_valid = payment_service.verify_payment_signature(
        body.razorpay_order_id,
        body.razorpay_payment_id,
        body.razorpay_signature,
    )
    if not is_valid:
        raise HTTPException(400, "Payment signature verification failed — possible tampering detected")

    # Fetch payment details from Razorpay
    try:
        razorpay_payment = payment_service.fetch_payment(body.razorpay_payment_id)
    except payment_service.PaymentError as exc:
        razorpay_payment = {"method": None}

    # Check if payment already exists (idempotency)
    existing = (
        await session.execute(
            select(Payment).where(
                Payment.razorpay_payment_id == body.razorpay_payment_id
            )
        )
    ).scalar_one_or_none()

    if existing:
        return PaymentResponse(
            id=str(existing.id),
            razorpay_payment_id=existing.razorpay_payment_id,
            razorpay_order_id=existing.razorpay_order_id,
            amount=existing.amount,
            currency=existing.currency,
            status=existing.status,
            method=existing.method,
        )

    # Store the payment
    payment = Payment(
        workspace_id=workspace_id,
        order_id=db_order.id,
        razorpay_payment_id=body.razorpay_payment_id,
        razorpay_order_id=body.razorpay_order_id,
        razorpay_signature=body.razorpay_signature,
        amount=db_order.amount,
        currency=db_order.currency,
        status="captured",
        method=razorpay_payment.get("method"),
        raw_response=razorpay_payment,
    )
    session.add(payment)

    # Update order status
    db_order.status = "paid"
    await session.commit()
    await session.refresh(payment)

    return PaymentResponse(
        id=str(payment.id),
        razorpay_payment_id=payment.razorpay_payment_id,
        razorpay_order_id=payment.razorpay_order_id,
        amount=payment.amount,
        currency=payment.currency,
        status=payment.status,
        method=payment.method,
    )


@router.get("/orders")
async def list_orders(
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """List all payment orders for this workspace."""
    rows = (
        await session.execute(
            select(PaymentOrder)
            .where(PaymentOrder.workspace_id == workspace_id)
            .order_by(PaymentOrder.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": str(o.id),
            "razorpay_order_id": o.razorpay_order_id,
            "amount": o.amount,
            "currency": o.currency,
            "status": o.status,
            "description": o.description,
            "customer_name": o.customer_name,
            "customer_email": o.customer_email,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in rows
    ]


@router.get("/payments")
async def list_payments(
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """List all completed payments for this workspace."""
    rows = (
        await session.execute(
            select(Payment)
            .where(Payment.workspace_id == workspace_id)
            .order_by(Payment.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": str(p.id),
            "razorpay_payment_id": p.razorpay_payment_id,
            "razorpay_order_id": p.razorpay_order_id,
            "amount": p.amount,
            "currency": p.currency,
            "status": p.status,
            "method": p.method,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    workspace_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Razorpay webhook endpoint for server-side payment confirmation.

    Configure this URL in Razorpay dashboard:
    https://<your-domain>/api/v1/workspaces/<workspace_id>/payments/webhook

    The webhook is verified using the Razorpay webhook secret.
    """
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not payment_service.verify_webhook_signature(body, signature):
        raise HTTPException(400, "Invalid webhook signature")

    import json
    event = json.loads(body)
    event_type = event.get("event", "")

    # Handle payment.captured event
    if event_type == "payment.captured":
        payload = event.get("payload", {}).get("payment", {}).get("entity", {})
        payment_id = payload.get("id")
        order_id = payload.get("order_id")
        amount = payload.get("amount")
        currency = payload.get("currency")
        method = payload.get("method")

        if payment_id and order_id:
            # Check if we already have this payment
            existing = (
                await session.execute(
                    select(Payment).where(
                        Payment.razorpay_payment_id == payment_id
                    )
                )
            ).scalar_one_or_none()

            if not existing:
                # Find the order
                db_order = (
                    await session.execute(
                        select(PaymentOrder).where(
                            PaymentOrder.razorpay_order_id == order_id
                        )
                    )
                ).scalar_one_or_none()

                if db_order:
                    payment = Payment(
                        workspace_id=workspace_id,
                        order_id=db_order.id,
                        razorpay_payment_id=payment_id,
                        razorpay_order_id=order_id,
                        amount=amount or db_order.amount,
                        currency=currency or db_order.currency,
                        status="captured",
                        method=method,
                        raw_response=payload,
                    )
                    session.add(payment)
                    db_order.status = "paid"
                    await session.commit()

    return {"status": "ok", "event": event_type}
