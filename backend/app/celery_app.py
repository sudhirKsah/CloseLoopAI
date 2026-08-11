from celery import Celery
from celery.schedules import crontab
from .config import settings

celery = Celery(
    "closeloop",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.jobs"],
)
celery.conf.update(
    timezone="UTC",
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Fail fast when the broker is unreachable so callers can fall back to
    # in-process execution instead of hanging on connection retries.
    broker_connection_retry_on_startup=False,
    broker_transport_options={
        "socket_timeout": 2,
        "socket_connect_timeout": 2,
    },
    beat_schedule={
        "daily-execution-monitor": {
            "task": "monitor.organizations",
            "schedule": crontab(hour=settings.monitoring_hour_utc, minute=0),
        },
        "friday-weekly-report": {
            "task": "reports.generate_weekly",
            "schedule": crontab(hour=4, minute=0, day_of_week="fri"),
        },
        "hourly-integration-sync": {
            "task": "integrations.sync_all",
            "schedule": crontab(minute=10),
        },
        "hourly-github-sync": {
            "task": "github.sync_all",
            "schedule": crontab(minute=25),
        },
    },
)
