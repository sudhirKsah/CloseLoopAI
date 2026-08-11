import json

from fastapi import APIRouter, HTTPException, Request, status

from ...jobs import process_github_webhook
from ...services.github import verify_github_signature

router = APIRouter(prefix="/webhooks", tags=["github-webhooks"])


@router.post("/github", status_code=status.HTTP_202_ACCEPTED)
async def github_webhook(request: Request) -> dict:
    """Primary GitHub ingestion path. Configure a repo/org webhook pointing here
    with content-type application/json and a secret matching
    GITHUB_WEBHOOK_SECRET. The hourly poller (`github.sync_all`) remains as a
    reconciliation fallback for anything a webhook misses."""
    body = await request.body()
    if not verify_github_signature(
        request.headers.get("x-hub-signature-256"), body
    ):
        raise HTTPException(401, "Invalid GitHub webhook signature")
    event_type = request.headers.get("x-github-event", "")
    try:
        payload = json.loads(body)
    except ValueError as error:
        raise HTTPException(400, "Invalid JSON") from error
    if event_type == "ping":
        return {"accepted": True, "pong": True}
    process_github_webhook.delay(event_type, payload)
    return {"accepted": True, "event": event_type}
