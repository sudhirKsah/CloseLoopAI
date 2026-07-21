from celery import Celery
from celery.schedules import crontab
from .config import settings

celery = Celery("closeloop", broker=settings.redis_url, backend=settings.redis_url, include=["app.jobs"])
celery.conf.update(
    timezone="UTC",
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    beat_schedule={
        "daily-execution-monitor": {"task": "monitor.organizations", "schedule": crontab(hour=settings.monitoring_hour_utc, minute=0)},
        "friday-weekly-report": {"task": "reports.generate_weekly", "schedule": crontab(hour=4, minute=0, day_of_week="fri")},
        "hourly-integration-sync": {"task": "integrations.sync_all", "schedule": crontab(minute=10)},
    },
)
