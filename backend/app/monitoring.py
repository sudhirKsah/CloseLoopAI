"""Daily execution monitor. Connectors are optional and failure-isolated."""
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models.integrations import CalendarEvent, ExternalTaskMapping, IntegrationProvider
from .models.work import Task, TaskActivityMatch, TaskState, TaskStatusHistory
class SignalKind(StrEnum): PROGRESS="progress"; BLOCKED="blocked"; COMPLETED="completed"; NO_ACTIVITY="no_activity"; CALENDAR_CONSTRAINT="calendar_constraint"
@dataclass(frozen=True)
class Signal: source:str; kind:SignalKind; occurred_at:datetime; evidence:str; confidence:float
@dataclass(frozen=True)
class Assessment: state:TaskState; score_delta:float; action:str|None; reason:str; blockers:list[str]
class TaskConnector:
    name:str
    async def collect(self,session:AsyncSession,task:Task,since:datetime)->list[Signal]: raise NotImplementedError
class GithubConnector(TaskConnector):
    name="github"
    async def collect(self,session,task,since):
        matches=(await session.execute(select(TaskActivityMatch).where(TaskActivityMatch.task_id==task.id,TaskActivityMatch.created_at>=since))).scalars().all()
        return [Signal(self.name,SignalKind.PROGRESS,m.created_at,m.reason,m.confidence) for m in matches]
class IssueTrackerConnector(TaskConnector):
    name="issue_tracker"
    async def collect(self,session,task,since):
        mappings=(await session.execute(select(ExternalTaskMapping).where(ExternalTaskMapping.task_id==task.id))).scalars().all(); out=[]
        for mapping in mappings:
            state=(mapping.last_status or "").casefold()
            if any(word in state for word in ("blocked","impediment","on hold")): out.append(Signal("jira_or_linear",SignalKind.BLOCKED,mapping.last_synced_at or since,f"External issue status: {mapping.last_status}",.9))
            elif any(word in state for word in ("done","closed","completed")): out.append(Signal("jira_or_linear",SignalKind.COMPLETED,mapping.last_synced_at or since,f"External issue status: {mapping.last_status}",.95))
            elif mapping.last_synced_at and mapping.last_synced_at>=since: out.append(Signal("jira_or_linear",SignalKind.PROGRESS,mapping.last_synced_at,"Issue updated during the monitoring window",.7))
        return out
class CalendarConnector(TaskConnector):
    name="calendar"
    async def collect(self,session,task,since):
        if not task.owner_id: return []
        events=(await session.execute(select(CalendarEvent).where(CalendarEvent.owner_id==task.owner_id,CalendarEvent.starts_at<=datetime.now(UTC)+timedelta(days=2),CalendarEvent.ends_at>=datetime.now(UTC)))).scalars().all()
        hours=sum((event.ends_at-event.starts_at).total_seconds()/3600 for event in events)
        if hours>=7: return [Signal(self.name,SignalKind.CALENDAR_CONSTRAINT,datetime.now(UTC),f"Owner has {hours:.1f} scheduled calendar hours in the next two days",.8)]
        return []
class HistoryConnector(TaskConnector):
    name="history"
    async def collect(self,session,task,since):
        history=(await session.execute(select(TaskStatusHistory).where(TaskStatusHistory.task_id==task.id).order_by(TaskStatusHistory.created_at.desc()).limit(1))).scalar_one_or_none()
        if history and history.to_state==TaskState.BLOCKED: return [Signal(self.name,SignalKind.BLOCKED,history.created_at,history.reason or "Task marked blocked in status history",.85)]
        return []
CONNECTORS:list[TaskConnector]=[GithubConnector(),IssueTrackerConnector(),CalendarConnector(),HistoryConnector()]
class MonitoringPolicy:
    def assess(self,task:Task,signals:list[Signal],now:datetime)->Assessment:
        blockers=[signal.evidence for signal in signals if signal.kind==SignalKind.BLOCKED]
        if any(signal.kind==SignalKind.COMPLETED for signal in signals): return Assessment(TaskState.COMPLETED,18,None,"Completion verified by a connected system.",blockers)
        if blockers: return Assessment(TaskState.BLOCKED,-14,"nudge","A connected system reports a blocker.",blockers)
        if task.due_at and task.due_at<now: return Assessment(TaskState.OVERDUE,-10,"reminder","The deadline has passed.",blockers)
        if any(signal.kind==SignalKind.PROGRESS for signal in signals): return Assessment(TaskState.IN_PROGRESS,8,None,"Recent delivery activity was detected.",blockers)
        inactive=not task.last_activity_at or task.last_activity_at<now-timedelta(days=3)
        if inactive: return Assessment(task.state,-6,"nudge","No progress signal has been recorded for three days.",blockers)
        return Assessment(task.state,0,None,"No material change.",blockers)
async def monitor_task(session:AsyncSession,task_id:str,now:datetime|None=None)->Assessment|None:
    now=now or datetime.now(UTC); task=await session.get(Task,task_id)
    if not task or task.state in (TaskState.COMPLETED,TaskState.CANCELLED): return None
    signals=[]
    for connector in CONNECTORS:
        try: signals.extend(await connector.collect(session,task,now-timedelta(days=1)))
        except Exception: continue # individual integrations never block other signals
    assessment=MonitoringPolicy().assess(task,signals,now)
    before=task.state; task.state=assessment.state; task.execution_score=max(0,min(100,task.execution_score+assessment.score_delta))
    if before!=task.state: session.add(TaskStatusHistory(task_id=task.id,from_state=before,to_state=task.state,reason=assessment.reason))
    await session.commit(); return assessment
