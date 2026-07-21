import hashlib
import asyncio, json
from datetime import UTC, datetime
from enum import StrEnum
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.operations import Reminder, DeliveryStatus
from ..models.work import Task
from ..config import settings
class Tone(StrEnum): FRIENDLY="friendly"; REMINDER="reminder"; FIRM="firm"; ESCALATION_WARNING="escalation_warning"; MANAGER_ESCALATION="manager_escalation"; FOUNDER_ESCALATION="founder_escalation"
class AccountabilityMessage(BaseModel): tone:Tone; body:str=Field(min_length=1,max_length=600)
def tone_for(task:Task,prior:int)->Tone:
    if prior>=5:return Tone.FOUNDER_ESCALATION
    if prior>=4:return Tone.MANAGER_ESCALATION
    if prior>=3:return Tone.ESCALATION_WARNING
    if prior>=2:return Tone.FIRM
    if prior>=1:return Tone.REMINDER
    return Tone.FRIENDLY
async def create_reminder(session:AsyncSession,task:Task,reason:str,blockers:list[str],channel:str="slack")->Reminder|None:
    if not task.owner_id:return None
    prior=(await session.execute(select(Reminder).where(Reminder.task_id==task.id).order_by(Reminder.created_at.desc()))).scalars().all()
    tone=tone_for(task,len(prior)); previous=[item.body for item in prior[:3]]
    body=await generate_message(task,reason,blockers,tone,previous)
    body_hash=hashlib.sha256(body.strip().casefold().encode()).hexdigest()
    if any(item.body_hash==body_hash for item in prior): return None
    reminder=Reminder(task_id=task.id,recipient_id=task.owner_id,scheduled_for=datetime.now(UTC),status=DeliveryStatus.PENDING,channel=channel,tone=tone,body=body,body_hash=body_hash,context={"reason":reason,"blockers":blockers,"previous_reminders":len(prior)})
    session.add(reminder); await session.commit(); return reminder
def _compose(task:Task,reason:str,blockers:list[str],tone:Tone,previous:list[str])->str:
    blocker=f" Blocker: {blockers[0]}." if blockers else ""
    due=f" Due: {task.due_at.date().isoformat()}." if task.due_at else ""
    prefix={Tone.FRIENDLY:"Quick check-in",Tone.REMINDER:"Reminder",Tone.FIRM:"Action needed",Tone.ESCALATION_WARNING:"Escalation warning",Tone.MANAGER_ESCALATION:"Manager attention requested",Tone.FOUNDER_ESCALATION:"Founder escalation"}[tone]
    return f"{prefix}: {task.title}.{due} {reason}{blocker} Please share a concrete next step or update the task."
async def generate_message(task:Task,reason:str,blockers:list[str],tone:Tone,previous:list[str])->str:
    prompt=f"""Write one concise accountability message (max 90 words). Tone: {tone.value}. Task: {task.title}. Due: {task.due_at}. Reason: {reason}. Blockers: {blockers}. Previous messages: {previous}. Do not repeat a previous message, do not shame, and ask for one concrete next step."""
    try:
        if settings.ai_provider=="openai":
            from openai import AsyncOpenAI
            response=await AsyncOpenAI(api_key=settings.openai_api_key).beta.chat.completions.parse(model=settings.meeting_extraction_model,messages=[{"role":"system","content":"You are a respectful execution coach. Return the requested structure only."},{"role":"user","content":prompt}],response_format=AccountabilityMessage)
            parsed=response.choices[0].message.parsed
            if parsed and parsed.tone==tone:return parsed.body
        if settings.ai_provider=="cerebras":
            def request():
                from cerebras.cloud.sdk import Cerebras
                response=Cerebras(api_key=settings.cerebras_api_key).chat.completions.create(model=settings.cerebras_model,messages=[{"role":"system","content":"Return JSON only."},{"role":"user","content":prompt}],response_format={"type":"json_schema","json_schema":{"name":"accountability","strict":True,"schema":AccountabilityMessage.model_json_schema()}},max_completion_tokens=400,temperature=.3)
                return response.choices[0].message.content
            parsed=AccountabilityMessage.model_validate_json(await asyncio.to_thread(request))
            if parsed.tone==tone:return parsed.body
    except Exception: pass
    return _compose(task,reason,blockers,tone,previous)
