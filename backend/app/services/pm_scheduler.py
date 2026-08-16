"""PM Scheduler — runs auto-onboard, auto-check-in, and auto-kickoff periodically.

Runs as a background asyncio task during the backend's lifespan. Every
interval it scans all workspaces with Slack + kgmemory connected and:
  1. Auto-onboards any new members who haven't been onboarded yet
  2. Auto check-ins on members who need a nudge (with rate-limiting)
  3. Auto-kickoffs projects that have unassigned tasks (assigns + DMs engineers)

The interval defaults to 30 minutes and can be configured via
PM_SCHEDULER_INTERVAL_MINUTES. A small random jitter is added to each
cycle so the PM doesn't feel robotic/predictable.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random

from sqlalchemy import select

from ..db.session import SessionLocal
from ..models.integrations import Integration, IntegrationProvider
from .pm_automation import auto_check_in, auto_onboard_new_members, kickoff_project

logger = logging.getLogger(__name__)

_INTERVAL = int(os.environ.get("PM_SCHEDULER_INTERVAL_MINUTES", "30")) * 60
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
        # Add jitter (±20%) so the PM doesn't ping at exact predictable intervals
        jitter = random.randint(-_INTERVAL // 5, _INTERVAL // 5)
        wait = max(60, _INTERVAL + jitter)
        await asyncio.sleep(wait)


async def _run_once() -> None:
    """Run one cycle: auto-onboard + auto-check-in + auto-kickoff for all eligible workspaces."""
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

                # Auto check-in (rate-limited internally)
                checkin_results = await auto_check_in(session, workspace_id)
                for r in checkin_results:
                    if r.get("slack_sent"):
                        logger.info(f"PM checked in with {r.get('person')} in {workspace_id}")
                    elif r.get("skipped"):
                        logger.debug(f"PM skipped check-in for {r.get('person')}: {r.get('reason')}")

                # Auto-kickoff: find projects with unassigned tasks and
                # auto-assign + DM engineers about them
                await _auto_kickoff_projects(session, workspace_id)
        except Exception as exc:
            logger.warning(f"PM scheduler failed for {workspace_id}: {exc}")


async def _auto_kickoff_projects(session, workspace_id) -> None:
    """Find projects that have unassigned tasks and auto-kickoff them.
    This auto-assigns tasks to best-matched engineers and DMs them on Slack."""
    from .kgmemory import get_client_for_workspace

    client = await get_client_for_workspace(session, str(workspace_id))
    if client is None:
        return

    try:
        projects = await client.list_projects()
    except Exception as exc:
        logger.warning(f"Auto-kickoff: failed to list projects for {workspace_id}: {exc}")
        return

    for project in projects:
        project_name = project.get("name")
        if not project_name:
            continue
        # Only kickoff projects in planning or active status
        status = project.get("status", "")
        if status not in ("planning", "active", "in_progress"):
            continue
        # Check if there are unassigned tasks
        try:
            tasks = await client.list_tasks(project_name)
        except Exception:
            continue
        unassigned = [t for t in tasks if not t.get("assignee")]
        if not unassigned:
            continue  # All tasks already assigned

        # Kickoff this project
        try:
            result = await kickoff_project(session, workspace_id, project_name)
            assigned = result.get("assigned", 0)
            reached_out = result.get("reached_out", 0)
            if reached_out > 0:
                logger.info(
                    f"PM auto-kickoff for '{project_name}' in {workspace_id}: "
                    f"{assigned} tasks assigned, {reached_out} engineers reached on Slack"
                )
        except Exception as exc:
            logger.warning(f"PM auto-kickoff failed for '{project_name}' in {workspace_id}: {exc}")
