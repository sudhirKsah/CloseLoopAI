"""Automated PM — the AI PM initiates and manages conversations with engineers
on Slack without manual triggering.

Two parts:
1. Event handler: when an engineer replies to a DM, process their reply through
   kgmemory (onboarding continue / ingest) and send the PM's next response back.
2. Scheduler: periodically scans for engineers who need proactive outreach
   (new members to onboard, silent members to check in on) and initiates
   conversations automatically.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import ExternalIdentity, User, WorkspaceMember
from ..models.integrations import (
    Integration,
    IntegrationProvider,
    OAuthCredential,
)
from .credentials import CredentialVault
from .kgmemory import KGMemoryError, get_client_for_workspace
from .slack import send_dm

# In-memory thread tracking: maps slack_user_id -> thread_ts
# so the PM replies in the same thread instead of new top-level messages.
_thread_ts: dict[str, str] = {}


async def get_slack_token(session: AsyncSession, workspace_id: uuid.UUID) -> str | None:
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.workspace_id == workspace_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
    ).scalar_one_or_none()
    if not integration:
        return None
    credential = (
        await session.execute(
            select(OAuthCredential).where(
                OAuthCredential.integration_id == integration.id
            )
        )
    ).scalar_one_or_none()
    if not credential:
        return None
    return CredentialVault().decrypt(credential.access_token_encrypted)


async def get_user_by_slack_id(
    session: AsyncSession, slack_user_id: str
) -> User | None:
    identity = (
        await session.execute(
            select(ExternalIdentity).where(
                ExternalIdentity.provider == "slack",
                ExternalIdentity.external_user_id == slack_user_id,
            )
        )
    ).scalar_one_or_none()
    if not identity:
        return None
    return await session.get(User, identity.user_id)


async def get_workspace_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> uuid.UUID | None:
    member = (
        await session.execute(
            select(WorkspaceMember).where(WorkspaceMember.user_id == user_id)
        )
    ).scalar_one_or_none()
    return member.workspace_id if member else None


async def get_slack_id_for_name(
    session: AsyncSession, workspace_id: uuid.UUID, name: str
) -> str | None:
    members = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id
            )
        )
    ).scalars().all()
    user_ids = [m.user_id for m in members]
    if not user_ids:
        return None
    users = (
        await session.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()
    name_lower = name.strip().lower()
    for user in users:
        if user.display_name and user.display_name.strip().lower() == name_lower:
            identity = (
                await session.execute(
                    select(ExternalIdentity).where(
                        ExternalIdentity.provider == "slack",
                        ExternalIdentity.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if identity:
                return identity.external_user_id
    for user in users:
        if user.display_name and name_lower in user.display_name.strip().lower():
            identity = (
                await session.execute(
                    select(ExternalIdentity).where(
                        ExternalIdentity.provider == "slack",
                        ExternalIdentity.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if identity:
                return identity.external_user_id
    return None


async def process_slack_reply(
    session: AsyncSession,
    slack_user_id: str,
    message_text: str,
    thread_ts: str | None = None,
) -> dict[str, Any]:
    """Process an incoming Slack DM reply from an engineer.

    1. Identify the user and their workspace.
    2. Check if they're in an onboarding conversation (via kgmemory status).
    3. If onboarding: forward their reply, get the PM's next question, send it back.
    4. If not onboarding: ingest their message as a general update.
    """
    user = await get_user_by_slack_id(session, slack_user_id)
    if not user:
        return {"processed": False, "reason": "User not found"}

    workspace_id = await get_workspace_for_user(session, user.id)
    if not workspace_id:
        return {"processed": False, "reason": "No workspace for user"}

    token = await get_slack_token(session, workspace_id)
    if not token:
        return {"processed": False, "reason": "Slack not connected"}

    client = await get_client_for_workspace(session, str(workspace_id))
    if client is None:
        return {"processed": False, "reason": "kgmemory not connected"}

    person_name = (user.display_name or "").split()[0] or user.display_name or "there"

    # Use the thread_ts from the incoming message if available,
    # otherwise use the last known thread for this user
    reply_thread_ts = thread_ts or _thread_ts.get(slack_user_id)

    # Check onboarding status
    try:
        onboarding = await client.onboarding_status(person_name)
    except KGMemoryError:
        onboarding = None

    if onboarding and onboarding.get("started") and not onboarding.get("completed"):
        # They're in an active onboarding conversation — continue it
        current_step = onboarding.get("step", "role_experience")
        try:
            result = await client.continue_onboarding(
                person_name, message_text, current_step
            )
        except KGMemoryError as exc:
            return {"processed": False, "reason": f"kgmemory error: {exc}"}

        pm_message = result.get("message")
        if pm_message:
            try:
                resp = await send_dm(
                    token, slack_user_id, pm_message, thread_ts=reply_thread_ts
                )
                # Track the thread timestamp for future replies
                if resp.get("ok"):
                    ts = resp.get("ts")
                    if ts:
                        _thread_ts[slack_user_id] = ts
                return {
                    "processed": True,
                    "action": "onboarding_continue",
                    "step": result.get("step"),
                    "slack_sent": True,
                    "thread_ts": reply_thread_ts,
                }
            except Exception as exc:
                return {
                    "processed": True,
                    "action": "onboarding_continue",
                    "step": result.get("step"),
                    "slack_sent": False,
                    "error": str(exc),
                }
        return {"processed": True, "action": "onboarding_continue", "slack_sent": False}

    # Not in onboarding — ingest as a general update, then generate
    # a contextual reply using the PM brain
    try:
        await client.ingest({
            "message": message_text,
            "speaker": person_name,
            "speaker_role": "engineer",
            "channel": "slack",
        })
    except KGMemoryError:
        return {"processed": False, "reason": "Ingest failed"}

    # Generate a contextual reply using the PM decision endpoint
    reply_text = None
    try:
        decision = await client.decide({
            "query": f"The engineer {person_name} just said: '{message_text}'. "
            f"Respond naturally as their PM. If they're asking who you are, "
            f"introduce yourself as their AI project manager. If they're saying "
            f"hi, greet them back and ask how things are going. If they're "
            f"asking a question, answer it. Keep it short and casual like Slack.",
            "audience": "engineer",
        })
        reply_text = decision.get("response_text")
    except Exception as exc:
        logger.warning(f"PM decide failed for general reply: {exc}")

    # Fall back to a simple acknowledgment if LLM failed
    if not reply_text or len(reply_text) > 500:
        reply_text = "Got it. Let me know if you need anything."

    try:
        await send_dm(
            token,
            slack_user_id,
            reply_text,
            thread_ts=reply_thread_ts,
        )
    except Exception:
        pass

    return {"processed": True, "action": "ingest", "slack_sent": True}


async def auto_onboard_new_members(
    session: AsyncSession, workspace_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Find workspace members who haven't been onboarded yet and start
    onboarding them automatically. Returns a list of results."""
    token = await get_slack_token(session, workspace_id)
    if not token:
        return [{"error": "Slack not connected"}]

    client = await get_client_for_workspace(session, str(workspace_id))
    if client is None:
        return [{"error": "kgmemory not connected"}]

    members = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id
            )
        )
    ).scalars().all()

    results = []
    for member in members:
        user = await session.get(User, member.user_id)
        if not user or not user.display_name:
            continue
        # Skip the owner (they're the founder, not an engineer to onboard)
        if member.role.value == "owner":
            continue

        person_name = user.display_name.split()[0]

        # Check if already onboarded
        try:
            status = await client.onboarding_status(person_name)
        except KGMemoryError:
            continue

        if status.get("started") and not status.get("completed"):
            # Already in progress — skip
            continue
        if status.get("completed"):
            continue

        # Find their Slack ID
        identity = (
            await session.execute(
                select(ExternalIdentity).where(
                    ExternalIdentity.provider == "slack",
                    ExternalIdentity.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not identity:
            continue

        # Start onboarding
        try:
            result = await client.start_onboarding(person_name, "engineer")
        except KGMemoryError:
            continue

        pm_message = result.get("message")
        if pm_message:
            try:
                resp = await send_dm(token, identity.external_user_id, pm_message)
                # Track the thread timestamp so future replies stay in thread
                if resp.get("ok") and resp.get("ts"):
                    _thread_ts[identity.external_user_id] = resp["ts"]
                results.append({
                    "person": person_name,
                    "slack_user_id": identity.external_user_id,
                    "action": "onboarding_started",
                    "slack_sent": True,
                })
            except Exception as exc:
                results.append({
                    "person": person_name,
                    "action": "onboarding_started",
                    "slack_sent": False,
                    "error": str(exc),
                })

    return results


async def auto_check_in(
    session: AsyncSession, workspace_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Run auto check-in via kgmemory and deliver messages to Slack."""
    token = await get_slack_token(session, workspace_id)
    if not token:
        return [{"error": "Slack not connected"}]

    client = await get_client_for_workspace(session, str(workspace_id))
    if client is None:
        return [{"error": "kgmemory not connected"}]

    try:
        result = await client.check_in_auto()
    except KGMemoryError as exc:
        return [{"error": f"kgmemory error: {exc}"}]

    check_ins = result.get("check_ins", [])
    if not check_ins:
        return [{"action": "auto_check_in", "message": "No one needs checking in"}]

    results = []
    for check_in in check_ins:
        person = check_in.get("person", "")
        message = check_in.get("check_in_message", "")
        if not person or not message:
            continue

        slack_id = await get_slack_id_for_name(session, workspace_id, person)
        if not slack_id:
            results.append({
                "person": person,
                "action": "check_in",
                "slack_sent": False,
                "error": "No Slack ID found",
            })
            continue

        try:
            await send_dm(token, slack_id, message)
            results.append({
                "person": person,
                "slack_user_id": slack_id,
                "action": "check_in",
                "slack_sent": True,
            })
        except Exception as exc:
            results.append({
                "person": person,
                "action": "check_in",
                "slack_sent": False,
                "error": str(exc),
            })

    return results
