from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.core import User
from ..models.meetings import Meeting
from ..models.operations import Insight
from ..models.work import Decision, Task, TaskState
def confidence(samples:int,strength:float=.7)->float:return round(min(.95,.35+min(samples,30)/60+strength*.25),2)
class AnalyticsEngine:
    async def build(self,session:AsyncSession,workspace_id:str,start:datetime,end:datetime)->tuple[dict,list[dict]]:
        tasks=(await session.execute(select(Task).where(Task.workspace_id==workspace_id,Task.created_at>=start,Task.created_at<end))).scalars().all()
        meetings=(await session.execute(select(Meeting).where(Meeting.workspace_id==workspace_id,Meeting.started_at>=start,Meeting.started_at<end))).scalars().all()
        users={user.id:user for user in (await session.execute(select(User))).scalars().all()}
        completed=[task for task in tasks if task.state==TaskState.COMPLETED]; missed=[task for task in tasks if task.due_at and task.due_at<end and task.state!=TaskState.COMPLETED]
        by_owner=Counter(task.owner_id for task in completed if task.owner_id); blocked=Counter((users.get(task.owner_id).department if task.owner_id and users.get(task.owner_id) else "Unassigned") for task in tasks if task.state==TaskState.BLOCKED)
        early=Counter(task.owner_id for task in completed if task.owner_id and task.due_at and task.updated_at<task.due_at)
        overdue=Counter(task.owner_id for task in missed if task.owner_id)
        weekday=Counter(task.updated_at.strftime("%A") for task in completed)
        scores=[task.execution_score for task in tasks]
        decisions=(await session.execute(select(Decision).join(Meeting,Decision.meeting_id==Meeting.id).where(Meeting.workspace_id==workspace_id,Decision.created_at>=start,Decision.created_at<end))).scalars().all()
        conversion=round(len(tasks)/len(decisions),2) if decisions else 0
        metrics={"organization_summary":{"tasks":len(tasks),"completed":len(completed),"missed":len(missed),"meetings":len(meetings)},"execution_score":round(sum(scores)/len(scores),1) if scores else 0,"meeting_efficiency":{"meetings":len(meetings),"decisions":len(decisions),"meeting_to_execution_ratio":conversion},"top_performers":[users[user_id].display_name for user_id,_ in by_owner.most_common(5) if user_id in users],"most_blocked_teams":blocked.most_common(5),"recommendations":self._recommend(len(missed),blocked,conversion)}
        insights=[]
        if early: insights.append({"key":"consistently_finishes_early","value":[users[x].display_name for x,_ in early.most_common(5) if x in users],"confidence":confidence(sum(early.values()),.8),"explanation":"Completed tasks before their committed due date."})
        if overdue: insights.append({"key":"misses_deadlines","value":[users[x].display_name for x,_ in overdue.most_common(5) if x in users],"confidence":confidence(sum(overdue.values()),.8),"explanation":"Open tasks whose deadline passed during the period."})
        if blocked: insights.append({"key":"departments_needing_attention","value":[name for name,_ in blocked.most_common(3)],"confidence":confidence(sum(blocked.values()),.7),"explanation":"Departments with the most blocked work."})
        active=Counter(task.owner_id for task in tasks if task.state not in (TaskState.COMPLETED,TaskState.CANCELLED) and task.owner_id)
        overloaded=[users[x].display_name for x,count in active.most_common(5) if count>=5 and x in users]
        insights += [{"key":"who_is_overloaded","value":overloaded,"confidence":confidence(len(tasks),.55),"explanation":"People with five or more active tasks in the period."},{"key":"frequently_helps_others","value":[],"confidence":.2,"explanation":"Requires task comments or review attribution; no sufficient evidence yet."},{"key":"unnecessary_meetings","value":[],"confidence":.2,"explanation":"Requires attendee and outcome coverage across more reporting periods."},{"key":"meeting_to_execution_ratio","value":conversion,"confidence":confidence(len(decisions),.7),"explanation":"Tasks created per recorded decision."},{"key":"average_decision_execution_time","value":None,"confidence":.2,"explanation":"Requires decisions linked to completed tasks; collection is still accumulating."},{"key":"execution_bottlenecks","value":[name for name,_ in blocked.most_common(3)],"confidence":confidence(sum(blocked.values()),.65),"explanation":"Teams with the most blocked work."},{"key":"most_productive_weekday","value":weekday.most_common(1)[0][0] if weekday else None,"confidence":confidence(len(completed),.5),"explanation":"Weekday with the most completed tasks."}]
        return metrics,insights
    def _recommend(self,missed:int,blocked:Counter,conversion:float)->list[str]:
        result=[]
        if missed: result.append("Review overdue work and confirm owners or revised dates.")
        if blocked: result.append("Run a blocker review with the most affected department.")
        if conversion<.5: result.append("Assign owners and due dates before closing meetings.")
        return result or ["Execution is healthy; keep decision ownership explicit."]
