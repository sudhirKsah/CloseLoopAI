"""Cloud Run job entry point — runs a scheduled task synchronously.

Usage:
    python run_job.py <task_name>

Task names:
    monitor.organizations     — daily execution monitoring (creates reminders)
    reports.generate_weekly   — Friday weekly reports
    integrations.sync_all     — hourly integration sync
    github.sync_all           — hourly GitHub sync

This avoids needing an always-on Celery worker. Cloud Scheduler triggers
this job on a cron schedule, the task runs to completion, and the container
shuts down — minimal free-tier usage.

Note: sub-tasks spawned via .delay() will be executed synchronously by
setting CELERY_ALWAYS_EAGER=True at import time below.
"""
import os
import sys

# Force Celery to run tasks synchronously (no worker needed)
os.environ.setdefault("CELERY_ALWAYS_EAGER", "true")

from app.jobs import (
    monitor_organizations,
    generate_weekly,
    sync_all_integrations,
    sync_github_activity,
)


TASKS = {
    "monitor.organizations": monitor_organizations,
    "reports.generate_weekly": generate_weekly,
    "integrations.sync_all": sync_all_integrations,
    "github.sync_all": sync_github_activity,
}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_job.py <task_name>", file=sys.stderr)
        print(f"Available tasks: {', '.join(TASKS.keys())}", file=sys.stderr)
        sys.exit(1)

    task_name = sys.argv[1]
    func = TASKS.get(task_name)
    if not func:
        print(f"Unknown task: {task_name}", file=sys.stderr)
        print(f"Available: {', '.join(TASKS.keys())}", file=sys.stderr)
        sys.exit(1)

    print(f"Running task: {task_name}")
    result = func()
    print(f"Result: {result}")
