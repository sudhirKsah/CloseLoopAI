import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...db.session import get_session
from ...api.deps import require_workspace_admin
from ...models.operations import EscalationRule, WeeklyReport
from ...services.reports import WeeklyReportService
router=APIRouter(prefix="/execution",tags=["execution"])
class RuleInput(BaseModel): name:str; priority:int=100; enabled:bool=True; conditions:dict; action:dict
@router.get("/workspaces/{workspace_id}/escalation-rules")
async def list_rules(workspace_id:uuid.UUID,_=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(EscalationRule).where(EscalationRule.workspace_id==workspace_id).order_by(EscalationRule.priority))).scalars().all()
    return [{"id":str(x.id),"name":x.name,"enabled":x.enabled,"priority":x.priority,"conditions":x.conditions,"action":x.action} for x in rows]
@router.post("/workspaces/{workspace_id}/escalation-rules")
async def create_rule(workspace_id:uuid.UUID,body:RuleInput,_=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->dict:
    rule=EscalationRule(workspace_id=workspace_id,**body.model_dump()); session.add(rule); await session.commit(); return {"id":str(rule.id)}
@router.post("/workspaces/{workspace_id}/reports")
async def generate_report(workspace_id:uuid.UUID,_=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->dict:
    report=await WeeklyReportService().generate(session,str(workspace_id)); return {"id":str(report.id),"pdf_url":report.pdf_url,"data":report.data}
@router.get("/workspaces/{workspace_id}/reports")
async def reports(workspace_id:uuid.UUID,_=Depends(require_workspace_admin),session:AsyncSession=Depends(get_session))->list[dict]:
    rows=(await session.execute(select(WeeklyReport).where(WeeklyReport.workspace_id==workspace_id).order_by(WeeklyReport.period_start.desc()))).scalars().all()
    return [{"id":str(x.id),"period_start":x.period_start,"pdf_url":x.pdf_url,"data":x.data} for x in rows]
