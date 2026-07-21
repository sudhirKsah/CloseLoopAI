"""Data-driven escalation rule evaluator; policy lives in database JSON, not code."""
from datetime import UTC, datetime, timedelta
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.core import User, Workspace
from ..models.operations import Escalation, EscalationRule, Reminder
from ..models.work import Task, TaskState
from .accountability import create_reminder
class RuleEngine:
    async def facts(self,session:AsyncSession,task:Task,now:datetime)->dict:
        prior=(await session.execute(select(func.count(Reminder.id)).where(Reminder.task_id==task.id))).scalar_one()
        overdue_days=max(0,(now-task.due_at).days) if task.due_at and task.due_at<now else 0
        # A newly created task has no activity yet; its age, not an arbitrary
        # sentinel value, determines whether it is eligible for a reminder.
        activity_anchor=task.last_activity_at or task.created_at
        inactive_days=max(0, (now-activity_anchor).days)
        missed=(await session.execute(select(func.count(Task.id)).where(Task.owner_id==task.owner_id,Task.due_at<now,Task.state.notin_([TaskState.COMPLETED,TaskState.CANCELLED])))).scalar_one() if task.owner_id else 0
        return {"inactive_days":inactive_days,"overdue_days":overdue_days,"reminder_count":prior,"missed_deadlines":missed,"state":task.state.value,"execution_score":task.execution_score}
    def matches(self,conditions:dict,facts:dict)->bool:
        for key,expected in conditions.items():
            value=facts.get(key)
            if isinstance(expected,dict):
                if "gte" in expected and not value>=expected["gte"]: return False
                if "lte" in expected and not value<=expected["lte"]: return False
                if "in" in expected and value not in expected["in"]: return False
            elif value!=expected:return False
        return True
    async def evaluate(self,session:AsyncSession,task:Task,now:datetime|None=None)->list[Escalation]:
        now=now or datetime.now(UTC); rules=(await session.execute(select(EscalationRule).where(EscalationRule.workspace_id==task.workspace_id,EscalationRule.enabled.is_(True)).order_by(EscalationRule.priority))).scalars().all()
        facts=await self.facts(session,task,now); created=[]
        for rule in rules:
            if not self.matches(rule.conditions,facts): continue
            action=rule.action
            if action.get("type")=="reminder": await create_reminder(session,task,f"Rule: {rule.name}",[],action.get("channel","slack"))
            if action.get("type")=="escalate":
                recipient=await self._recipient(session,task,action)
                if recipient and not (await session.execute(select(Escalation.id).where(Escalation.task_id==task.id,Escalation.level==action.get("level",1),Escalation.resolved_at.is_(None)))).scalar_one_or_none():
                    escalation=Escalation(task_id=task.id,escalated_to_id=recipient,level=action.get("level",1),reason=f"{rule.name}: {facts}"); session.add(escalation); created.append(escalation)
        await session.commit(); return created
    async def _recipient(self,session:AsyncSession,task:Task,action:dict):
        if action.get("target")=="manager" and task.owner_id:
            owner=await session.get(User,task.owner_id); return owner.manager_id if owner else None
        if action.get("target")=="founder":
            workspace=await session.get(Workspace,task.workspace_id); return workspace.settings.get("founder_user_id") if workspace else None
        return task.owner_id
DEFAULT_RULES=[
 {"name":"No progress 3 days","priority":10,"conditions":{"inactive_days":{"gte":3}},"action":{"type":"reminder","channel":"slack"}},
 {"name":"No progress 7 days","priority":20,"conditions":{"inactive_days":{"gte":7}},"action":{"type":"escalate","target":"manager","level":2}},
 {"name":"No progress 14 days","priority":30,"conditions":{"inactive_days":{"gte":14}},"action":{"type":"escalate","target":"founder","level":3}},
 {"name":"Repeated missed deadlines","priority":40,"conditions":{"missed_deadlines":{"gte":3}},"action":{"type":"escalate","target":"manager","level":2}},
]
