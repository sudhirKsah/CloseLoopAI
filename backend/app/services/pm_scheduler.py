"""PM Scheduler — runs auto-onboard and auto-check-in periodically.

Runs as a background asyncio task during the backend's lifespan. Every
interval it scans all workspaces with Slack + kgmemory connected and:
  1. Auto-onboards any new members who haven't been onboarded yet
  2. Auto check-ins on members who need a nudge

The interval defaults to 4 hours and can be configured via PM_SCHEDULER_INTERVAL_HOURS.
"""
from __future__ import annotations

import asyncio
import logging
import os

from sqlalchemy import select

from ..db.session import SessionLocal
from ..models.integrations import Integration, IntegrationProvider
from .pm_automation import auto_check_in, auto_onboard_new_members

logger = logging.getLogger(__name__)

_INTERVAL = int(os.environ.get("PM_SCHEDULER_INTERVAL_HOURS", "4")) * 3600
_task: asyncio.Task | None = None


async def start_pm_scheduler() -> None:
    global _task
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_run_loop())
    logger.info(f"PM scheduler started (interval={_INTERVAL}s)")


async def stop_pm_scheduler() -> None:
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
        logger.info("PM scheduler stopped")


async def _run_loop() -> None:
    # Wait a bit on startup so other services are ready
    await asyncio.sleep(30)
    while True:
        try:
            await _run_once()
        except Exception as exc:
            logger.error(f"PM scheduler error: {exc}", exc_info=True)
        await asyncio.sleep(_INTERVAL)


async def _run_once() -> None:
    """Run one cycle: auto-onboard + auto-check-in for all eligible workspaces."""
    async with SessionLocal() as session:
        # Find all workspaces with Slack connected
        rows = (
            await session.execute(
                select(Integration).where(
                    Integration.provider == IntegrationProvider.SLACK
                )
            )
        ).scalars().all()

    for integration in rows:
        workspace_id = integration.workspace_id
        try:
            async with SessionLocal() as session:
                # Auto-onboard new members
                onboard_results = await auto_onboard_new_members(session, workspace_id)
                for r in onboard_results:
                    if r.get("slack_sent"):
                        logger.info(f"PM auto-onboarded {r.get('person')} in {workspace_id}")

                # Auto check-in
                checkin_results = await auto_check_in(session, workspace_id)
                for r in checkin_results:
                    if r.get("slack_sent"):
                        logger.info(f"PM checked in with {r.get('person')} in {workspace_id}")
        except Exception as exc:
            logger.warning(f"PM scheduler failed for {workspace_id}: {exc}")
