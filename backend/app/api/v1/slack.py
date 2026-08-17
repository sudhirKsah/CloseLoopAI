import json, uuid, logging
from urllib.parse import parse_qs
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...db.session import get_session, SessionLocal
from ...models.core import ExternalIdentity
from ...services.approvals import TaskApprovalService
from ...services.slack import verify_slack
from ...services.pm_automation import process_slack_reply

logger = logging.getLogger(__name__)

# Deduplication: track processed Slack event IDs to avoid processing
# the same message multiple times (Slack retries if we don't respond fast)
_processed_events: set[str] = set()
# Keep the set from growing forever — cap at 1000 entries
_MAX_PROCESSED = 1000

router = APIRouter(prefix="/slack", tags=["slack"])


@router.post("/actions")
async def slack_actions(
    request: Request, session: AsyncSession = Depends(get_session)
) -> dict:
    body = await request.body()
    verify_slack({key.lower(): value for key, value in request.headers.items()}, body)
    encoded = parse_qs(body.decode("utf-8"), keep_blank_values=True)
    if not encoded.get("payload"):
        raise HTTPException(400, "Slack action payload missing")
    payload = json.loads(encoded["payload"][0])
    action = payload["actions"][0]
    action_id = action["action_id"]
    candidate_id = uuid.UUID(action["value"])
    identity = (
        await session.execute(
            select(ExternalIdentity).where(
                ExternalIdentity.provider == "slack",
                ExternalIdentity.external_user_id == payload["user"]["id"],
            )
        )
    ).scalar_one_or_none()
    if not identity:
        raise HTTPException(403, "Slack user is not linked to a Pathayo user")
    if action_id == "closeloop_task_edit":
        return {
            "response_action": "push",
            "view": {
                "type": "modal",
                "title": {"type": "plain_text", "text": "Edit in Pathayo"},
                "close": {"type": "plain_text", "text": "Close"},
                "blocks": [],
            },
        }
    candidate = await TaskApprovalService().review(
        session,
        candidate_id,
        "approve" if action_id == "closeloop_task_approve" else "reject",
        identity.user_id,
    )
    return {"replace_original": True, "text": f"Task {candidate.state}."}


@router.post("/events")
async def slack_events(
    request: Request,
) -> dict:
    """Slack Events API webhook.

    Handles:
    - url_verification challenge (Slack sends this when you first set up the URL)
    - message.im events (when a user DMs the bot, process their reply through
      the automated PM and send a response back)
    """
    body = await request.body()
    payload = json.loads(body)

    # Slack URL verification handshake
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}

    event = payload.get("event", {})
    event_type = event.get("type")

    logger.info(f"Slack event received: type={event_type}")

    # Only handle direct messages to the bot
    if event_type != "message":
        return {"ok": True}

    # Skip bot messages (including our own)
    if event.get("bot_id") or event.get("subtype"):
        return {"ok": True}

    slack_user_id = event.get("user", "")
    message_text = event.get("text", "")
    channel = event.get("channel", "")
    # thread_ts is set when the message is part of a thread.
    # If the message is a top-level DM, thread_ts is None and we use message_ts.
    thread_ts = event.get("thread_ts")
    message_ts = event.get("ts")

    logger.info(f"Slack DM from {slack_user_id}: '{message_text}' (channel={channel}, thread_ts={thread_ts}, ts={message_ts})")

    if not slack_user_id or not message_text:
        return {"ok": True}

    # Deduplicate: Slack retries events if we don't respond within 3 seconds.
    # Use the message's event_id (or ts+user as fallback) to skip duplicates.
    event_id = payload.get("event_id") or f"{message_ts}:{slack_user_id}"
    if event_id in _processed_events:
        logger.info(f"Skipping duplicate Slack event: {event_id}")
        return {"ok": True}
    _processed_events.add(event_id)
    if len(_processed_events) > _MAX_PROCESSED:
        # Clear half the set to prevent unbounded growth
        _processed_events.clear()
        _processed_events.add(event_id)

    # Use thread_ts if available (reply in thread), otherwise use the message's
    # own ts as the thread root (so our response starts a thread from their message)
    reply_thread_ts = thread_ts or message_ts

    # Process the reply. Slack retries if we don't respond within 3 seconds,
    # but the kgmemory call can take 10-30 seconds. We use a background task
    # but with proper error handling and logging.
    import asyncio

    async def _process():
        try:
            logger.info(f"Processing Slack reply from {slack_user_id}...")
            async with SessionLocal() as session:
                result = await process_slack_reply(
                    session, slack_user_id, message_text, thread_ts=reply_thread_ts
                )
                logger.info(f"Slack reply processed: {result}")
        except Exception as exc:
            logger.error(f"Error processing Slack reply: {exc}", exc_info=True)

    task = asyncio.ensure_future(_process())
    task.add_done_callback(
        lambda t: t.exception() and logger.error(f"Background task failed: {t.exception()}", exc_info=True)
    )
    return {"ok": True}
