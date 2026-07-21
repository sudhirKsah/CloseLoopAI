from datetime import UTC, datetime, timedelta
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML
from ..config import settings
from ..models.operations import Insight, WeeklyReport
from ..models.core import User, WorkspaceMember
from .delivery import send_email
from .analytics import AnalyticsEngine
class WeeklyReportService:
    async def generate(self,session:AsyncSession,workspace_id:str,period_end:datetime|None=None)->WeeklyReport:
        period_end=period_end or datetime.now(UTC); start=period_end-timedelta(days=7)
        metrics,insights=await AnalyticsEngine().build(session,workspace_id,start,period_end)
        report=(await session.execute(select(WeeklyReport).where(WeeklyReport.workspace_id==workspace_id,WeeklyReport.period_start==start))).scalar_one_or_none()
        if not report: report=WeeklyReport(workspace_id=workspace_id,period_start=start,data=metrics); session.add(report); await session.flush()
        report.data,report.status=metrics,"generated"
        for item in insights: session.add(Insight(workspace_id=workspace_id,weekly_report_id=report.id,key=item["key"],value={"value":item["value"]},confidence=item["confidence"],explanation=item["explanation"]))
        directory=Path(settings.reports_dir); directory.mkdir(parents=True,exist_ok=True); path=directory/f"{report.id}.pdf"
        HTML(string=self._html(metrics,insights,start,period_end)).write_pdf(path)
        report.pdf_url=str(path); await session.commit(); return report
    async def email_to_admins(self,session:AsyncSession,report:WeeklyReport)->int:
        admins=(await session.execute(select(User).join(WorkspaceMember,WorkspaceMember.user_id==User.id).where(WorkspaceMember.workspace_id==report.workspace_id,WorkspaceMember.role.in_(["owner","admin"]),User.is_login_enabled.is_(True)))).scalars().all()
        for user in admins:
            await __import__("asyncio").to_thread(send_email,user.email,"CloseLoop weekly execution report",f"Your report is ready: {report.pdf_url}")
        return len(admins)
    def _html(self,metrics:dict,insights:list[dict],start:datetime,end:datetime)->str:
        rows="".join(f"<li><b>{item['key'].replace('_',' ').title()}</b>: {item['value']} <small>confidence {item['confidence']:.0%}</small><br>{item['explanation']}</li>" for item in insights)
        chart="".join(f"<div style='height:{max(8,min(160,value*6))}px'></div>" for value in [metrics["organization_summary"]["tasks"],metrics["organization_summary"]["completed"],metrics["organization_summary"]["missed"]])
        return f"<html><style>body{{font-family:Arial;padding:36px;color:#171717}}h1{{color:#1b7657}}.cards{{display:flex;gap:12px}}.card{{padding:16px;background:#f4f5f6;border-radius:8px}}.chart{{display:flex;gap:16px;align-items:end;height:180px}}.chart div{{width:64px;background:#74dfbb}}small{{color:#666}}</style><h1>CloseLoop Weekly Execution Report</h1><p>{start.date()} – {end.date()}</p><div class='cards'><div class='card'>Execution score<br><b>{metrics['execution_score']}</b></div><div class='card'>Completed<br><b>{metrics['organization_summary']['completed']}</b></div><div class='card'>Missed<br><b>{metrics['organization_summary']['missed']}</b></div></div><h2>Execution chart</h2><div class='chart'>{chart}</div><h2>Insights</h2><ul>{rows}</ul><h2>Recommendations</h2><ul>{''.join(f'<li>{x}</li>' for x in metrics['recommendations'])}</ul></html>"
