import asyncio
from datetime import UTC, datetime, timedelta
from .celery_app import celery
from .monitoring import TaskConnector, monitor_task as apply_monitoring_task
from .db.session import SessionLocal
from .models.webhooks import WebhookEvent
from .services.recall_events import process_recall_event
from .services.meeting_extraction import run_extraction
from .services.task_sync import sync_workspace
from .services.credentials import CredentialVault
from .services.slack import post_approval
from .services.accountability import create_reminder
from .services.delivery import send_email, send_slack_dm
from .services.escalation_rules import RuleEngine

CONNECTORS: list[TaskConnector] = []  # Register Github, Jira, Linear, Calendar connectors at startup.
@celery.task(name="monitor.organizations")
def monitor_organizations() -> dict:
    async def run() -> dict:
        from sqlalchemy import select
        from .models.work import Task, TaskState
        async with SessionLocal() as session:
            task_ids=(await session.execute(select(Task.id).where(Task.state.notin_([TaskState.COMPLETED,TaskState.CANCELLED])))).scalars().all()
            for task_id in task_ids: monitor_task_job.delay(str(task_id))
            return {"scheduled":len(task_ids)}
    return asyncio.run(run())
@celery.task(name="monitor.task")
def monitor_task(task_id: str) -> dict:
    return monitor_task_job(task_id)
@celery.task(name="monitor.task.apply", autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def monitor_task_job(task_id: str) -> dict:
    async def run() -> dict:
        from .models.work import Task
        async with SessionLocal() as session:
            assessment=await apply_monitoring_task(session,task_id)
            task=await session.get(Task,task_id)
            if assessment and assessment.action and task:
                reminder=await create_reminder(session,task,assessment.reason,assessment.blockers)
                if reminder: deliver_reminder.delay(str(reminder.id))
            if task:
                escalations=await RuleEngine().evaluate(session,task)
                from sqlalchemy import select
                from .models.operations import DeliveryStatus, Reminder
                pending=(await session.execute(select(Reminder.id).where(Reminder.task_id==task.id,Reminder.status==DeliveryStatus.PENDING))).scalars().all()
                for reminder_id in pending: deliver_reminder.delay(str(reminder_id))
            return {"task_id":task_id,"action":assessment.action if assessment else None}
    return asyncio.run(run())
@celery.task(name="reports.generate_weekly")
def generate_weekly() -> dict:
    async def run() -> dict:
        from sqlalchemy import select
        from .models.core import Workspace
        from .services.reports import WeeklyReportService
        async with SessionLocal() as session:
            reports=[]
            for workspace_id in (await session.execute(select(Workspace.id))).scalars().all():
                service=WeeklyReportService(); report=await service.generate(session,str(workspace_id)); await service.email_to_admins(session,report); reports.append(str(report.id))
            return {"generated_at":datetime.now(UTC).isoformat(),"reports":reports}
    return asyncio.run(run())
@celery.task(name="recall.process_webhook", autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=5)
def process_recall_webhook(event_id: str) -> dict:
    async def run() -> dict:
        async with SessionLocal() as session:
            event = await session.get(WebhookEvent, event_id)
            if not event or event.processed_at: return {"event_id": event_id, "status": "skipped"}
            await process_recall_event(session, event)
            await session.commit()
            return {"event_id": event_id, "status": "processed"}
    return asyncio.run(run())
@celery.task(name="meetings.extract", autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def process_meeting_extraction(transcript_id: str) -> dict:
    async def run() -> dict:
        async with SessionLocal() as session:
            extraction = await run_extraction(session, transcript_id)
            from sqlalchemy import select
            from .models.work import CandidateState, TaskCandidate
            pending=(await session.execute(select(TaskCandidate.id).where(TaskCandidate.extraction_id==extraction.id,TaskCandidate.state==CandidateState.PENDING))).scalars().all()
            for candidate_id in pending: send_slack_approval.delay(str(candidate_id))
            return {"transcript_id": transcript_id, "extraction_id": str(extraction.id), "status": extraction.status}
    return asyncio.run(run())
@celery.task(name="integrations.sync_all", autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def sync_all_integrations() -> dict:
    async def run() -> dict:
        from sqlalchemy import select
        from .models.core import Workspace
        async with SessionLocal() as session:
            workspaces=(await session.execute(select(Workspace.id))).scalars().all()
            return {"synced": sum([await sync_workspace(session,str(workspace_id)) for workspace_id in workspaces])}
    return asyncio.run(run())
@celery.task(name="approvals.send_slack", autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def send_slack_approval(candidate_id: str) -> dict:
    async def run() -> dict:
        from sqlalchemy import select
        from .models.integrations import Integration, IntegrationProvider, OAuthCredential
        from .models.work import TaskCandidate
        async with SessionLocal() as session:
            candidate=await session.get(TaskCandidate,candidate_id)
            if not candidate: return {"status":"missing"}
            integration=(await session.execute(select(Integration).where(Integration.workspace_id==candidate.workspace_id,Integration.provider==IntegrationProvider.SLACK))).scalar_one_or_none()
            if not integration or not integration.config.get("approval_channel"): return {"status":"no_slack_channel"}
            credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id==integration.id))).scalar_one_or_none()
            if not credential: return {"status":"no_slack_credential"}
            response=await post_approval(CredentialVault().decrypt(credential.access_token_encrypted),integration.config["approval_channel"],candidate)
            return {"status":"sent","message_ts":response.get("ts")}
    return asyncio.run(run())
@celery.task(name="reminders.deliver", autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def deliver_reminder(reminder_id: str) -> dict:
    async def run() -> dict:
        from sqlalchemy import select
        from .models.core import ExternalIdentity, User
        from .models.integrations import Integration, IntegrationProvider, OAuthCredential
        from .models.operations import DeliveryStatus, Reminder
        async with SessionLocal() as session:
            reminder=await session.get(Reminder,reminder_id)
            if not reminder or reminder.status!=DeliveryStatus.PENDING:return {"status":"skipped"}
            user=await session.get(User,reminder.recipient_id)
            try:
                if reminder.channel=="slack":
                    identity=(await session.execute(select(ExternalIdentity).where(ExternalIdentity.user_id==user.id,ExternalIdentity.provider=="slack"))).scalar_one_or_none()
                    integration=(await session.execute(select(Integration).where(Integration.provider==IntegrationProvider.SLACK))).scalar_one_or_none()
                    credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id==integration.id))).scalar_one_or_none() if integration else None
                    if not identity or not credential: reminder.channel="email"
                    else: await send_slack_dm(CredentialVault().decrypt(credential.access_token_encrypted),identity.external_user_id,reminder.body)
                if reminder.channel=="email": await asyncio.to_thread(send_email,user.email,"CloseLoop task update",reminder.body)
                reminder.status,reminder.sent_at=DeliveryStatus.SENT,datetime.now(UTC); await session.commit(); return {"status":"sent","channel":reminder.channel}
            except Exception as error:
                reminder.status=DeliveryStatus.FAILED; reminder.context={**reminder.context,"delivery_error":str(error)[:500]}; await session.commit(); raise
    return asyncio.run(run())
