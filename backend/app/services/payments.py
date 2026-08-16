"""Razorpay payment service — wraps the Razorpay Python SDK.

Razorpay is an Indian payment gateway that supports:
- UPI (instant bank transfer)
- Credit/Debit cards (domestic + international)
- Netbanking (all major Indian banks)
- Wallets (Paytm, Mobikwik, etc.)
- International cards (US and other countries)

Test mode works without any legal paperwork. Get your test keys from
https://dashboard.razorpay.com/app/keys

To go live you need:
- PAN card
- Bank account details
- Business website (optional for individuals/freelancers)
"""
from __future__ import annotations

import logging
from typing import Any

# Razorpay SDK uses pkg_resources which is removed in Python 3.13+.
# Patch it in if missing before importing razorpay.
try:
    import pkg_resources  # noqa: F401
except ImportError:
    import sys
    import types
    if "pkg_resources" not in sys.modules:
        stub = types.ModuleType("pkg_resources")
        _Dist = type("Dist", (), {"version": "0.0.0", "project_name": "razorpay"})
        stub.get_distribution = lambda name: _Dist()
        stub.require = lambda *a, **kw: []
        stub.DistributionNotFound = type("DistributionNotFound", (Exception,), {})
        stub.parse_version = lambda v: tuple(int(x) for x in str(v).split(".") if x.isdigit())
        sys.modules["pkg_resources"] = stub

import razorpay

from ..config import settings

logger = logging.getLogger(__name__)

_client: razorpay.Client | None = None


def get_client() -> razorpay.Client | None:
    """Get the Razorpay client singleton. Returns None if not configured."""
    global _client
    if _client is not None:
        return _client
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        return None
    _client = razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )
    return _client


def is_configured() -> bool:
    """Check if Razorpay keys are configured."""
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


class PaymentError(Exception):
    """Raised when a Razorpay API call fails."""

    def __init__(self, message: str, status_code: int = 500):
        self.status_code = status_code
        super().__init__(message)


def create_order(
    amount: int,
    currency: str = "INR",
    description: str | None = None,
    customer_name: str | None = None,
    customer_email: str | None = None,
    customer_contact: str | None = None,
    notes: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Create a Razorpay order.

    Args:
        amount: Amount in the smallest currency unit.
                INR: paise (₹1 = 100 paise)
                USD: cents ($1 = 100 cents)
        currency: Currency code (INR, USD, etc.)
        description: Short description of the payment
        customer_name: Customer's name
        customer_email: Customer's email
        customer_contact: Customer's phone number
        notes: Additional notes (key-value pairs)

    Returns:
        Razorpay order dict with id, amount, currency, status, etc.
    """
    client = get_client()
    if client is None:
        raise PaymentError("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")

    try:
        order_data: dict[str, Any] = {
            "amount": amount,
            "currency": currency,
            "payment_capture": 1,  # Auto-capture payment
        }
        if description:
            order_data["notes"] = {"description": description}
        if notes:
            order_data["notes"] = {**(order_data.get("notes") or {}), **notes}

        order = client.order.create(order_data)
        return order
    except razorpay.errors.ServerError as exc:
        logger.error(f"Razorpay server error creating order: {exc}")
        raise PaymentError(f"Razorpay server error: {exc}", 502)
    except razorpay.errors.BadRequestError as exc:
        logger.error(f"Razorpay bad request creating order: {exc}")
        raise PaymentError(f"Invalid request: {exc}", 400)
    except Exception as exc:
        logger.error(f"Razorpay error creating order: {exc}")
        raise PaymentError(f"Failed to create order: {exc}", 500)


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """Verify the payment signature from Razorpay checkout.

    This confirms the payment is genuine and wasn't tampered with.
    """
    client = get_client()
    if client is None:
        raise PaymentError("Razorpay is not configured.")

    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        logger.warning(f"Payment signature verification failed for order {razorpay_order_id}")
        return False
    except Exception as exc:
        logger.error(f"Error verifying payment signature: {exc}")
        return False


def fetch_payment(razorpay_payment_id: str) -> dict[str, Any]:
    """Fetch payment details from Razorpay by payment ID."""
    client = get_client()
    if client is None:
        raise PaymentError("Razorpay is not configured.")

    try:
        return client.payment.fetch(razorpay_payment_id)
    except Exception as exc:
        logger.error(f"Razorpay error fetching payment {razorpay_payment_id}: {exc}")
        raise PaymentError(f"Failed to fetch payment: {exc}", 500)


def verify_webhook_signature(
    webhook_body: bytes,
    webhook_signature: str,
) -> bool:
    """Verify a Razorpay webhook signature.

    Razorpay sends a X-Razorpay-Signature header with webhooks.
    The body must be the raw request body (bytes).
    """
    if not settings.razorpay_webhook_secret:
        logger.warning("Razorpay webhook secret not configured")
        return False

    client = get_client()
    if client is None:
        return False

    try:
        client.utility.verify_webhook_signature(
            webhook_body,
            webhook_signature,
            settings.razorpay_webhook_secret,
        )
        return True
    except Exception as exc:
        logger.warning(f"Webhook signature verification failed: {exc}")
        return False
