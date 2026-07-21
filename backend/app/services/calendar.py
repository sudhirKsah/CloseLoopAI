from datetime import UTC, datetime, timedelta
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..models.integrations import CalendarEvent, Integration, IntegrationProvider, OAuthCredential
from ..models.operations import Reminder
from .credentials import CredentialVault
class CalendarClient:
    def __init__(self,provider:IntegrationProvider): self.provider=provider
    @property
    def authorize_url(self)->str: return "https://accounts.google.com/o/oauth2/v2/auth" if self.provider==IntegrationProvider.GOOGLE_CALENDAR else "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    @property
    def scopes(self)->str: return "https://www.googleapis.com/auth/calendar.readonly" if self.provider==IntegrationProvider.GOOGLE_CALENDAR else "offline_access Calendars.Read"
    async def access_token(self,code:str,redirect_uri:str)->dict:
        if self.provider==IntegrationProvider.GOOGLE_CALENDAR: url="https://oauth2.googleapis.com/token"; data={"grant_type":"authorization_code","code":code,"redirect_uri":redirect_uri,"client_id":settings.google_client_id,"client_secret":settings.google_client_secret}
        else: url="https://login.microsoftonline.com/common/oauth2/v2.0/token"; data={"grant_type":"authorization_code","code":code,"redirect_uri":redirect_uri,"client_id":settings.microsoft_client_id,"client_secret":settings.microsoft_client_secret}
        async with httpx.AsyncClient() as c: r=await c.post(url,data=data); r.raise_for_status(); return r.json()
    async def token_for(self,session:AsyncSession,integration:Integration)->str:
        credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id==integration.id))).scalar_one()
        vault=CredentialVault()
        if credential.expires_at and credential.expires_at <= datetime.now(UTC)+timedelta(minutes=2):
            refresh=vault.decrypt(credential.refresh_token_encrypted or "")
            if self.provider==IntegrationProvider.GOOGLE_CALENDAR: url="https://oauth2.googleapis.com/token"; data={"grant_type":"refresh_token","refresh_token":refresh,"client_id":settings.google_client_id,"client_secret":settings.google_client_secret}
            else: url="https://login.microsoftonline.com/common/oauth2/v2.0/token"; data={"grant_type":"refresh_token","refresh_token":refresh,"client_id":settings.microsoft_client_id,"client_secret":settings.microsoft_client_secret}
            async with httpx.AsyncClient() as c: response=await c.post(url,data=data); response.raise_for_status(); refreshed=response.json()
            credential.access_token_encrypted=vault.encrypt(refreshed["access_token"]); credential.refresh_token_encrypted=vault.encrypt(refreshed.get("refresh_token",refresh)); credential.expires_at=datetime.now(UTC)+timedelta(seconds=refreshed.get("expires_in",3600)); await session.commit()
        return vault.decrypt(credential.access_token_encrypted)
    async def events(self,token:str,start:datetime,end:datetime)->list[dict]:
        async with httpx.AsyncClient() as c:
            if self.provider==IntegrationProvider.GOOGLE_CALENDAR:
                r=await c.get("https://www.googleapis.com/calendar/v3/calendars/primary/events",params={"timeMin":start.isoformat(),"timeMax":end.isoformat(),"singleEvents":"true","orderBy":"startTime"},headers={"Authorization":f"Bearer {token}"}); r.raise_for_status(); return r.json().get("items",[])
            r=await c.get("https://graph.microsoft.com/v1.0/me/calendarView",params={"startDateTime":start.isoformat(),"endDateTime":end.isoformat()},headers={"Authorization":f"Bearer {token}"}); r.raise_for_status(); return r.json().get("value",[])
def calendar_health(events:list[dict],now:datetime|None=None)->dict:
    now=now or datetime.now(UTC); busy=0; oof=False; meetings=0
    for event in events:
        start_data=event.get("start",{})
        end_data=event.get("end",{})
        # Google uses dateTime; all-day events use date. Microsoft calendarView
        # also uses dateTime. All-day events do not contribute to meeting load.
        start=start_data.get("dateTime")
        end=end_data.get("dateTime")
        if event.get("showAs")=="oof" or "vacation" in event.get("summary",event.get("subject","")).casefold() or "out of office" in event.get("summary",event.get("subject","")).casefold(): oof=True
        if start and end:
            try: busy+=(datetime.fromisoformat(end.replace("Z","+00:00"))-datetime.fromisoformat(start.replace("Z","+00:00"))).total_seconds()/3600; meetings+=1
            except ValueError: pass
    return {"busy_hours":round(busy,1),"out_of_office":oof,"vacation":oof,"meeting_overload":busy>=6 or meetings>=6,"recommended_due_days":5 if oof or busy>=6 else 3}
async def sync_calendar(session:AsyncSession,integration:Integration,user_id:str)->dict:
    client=CalendarClient(integration.provider); events=await client.events(await client.token_for(session,integration),datetime.now(UTC),datetime.now(UTC)+timedelta(days=14))
    for event in events:
        external_id=event["id"]; existing=(await session.execute(select(CalendarEvent).where(CalendarEvent.integration_id==integration.id,CalendarEvent.external_id==external_id))).scalar_one_or_none()
        if existing: continue
        start=event["start"].get("dateTime"); end=event["end"].get("dateTime")
        if not start or not end: continue
        session.add(CalendarEvent(integration_id=integration.id,owner_id=user_id,external_id=external_id,title=event.get("summary") or event.get("subject") or "Busy",starts_at=datetime.fromisoformat(start.replace("Z","+00:00")),ends_at=datetime.fromisoformat(end.replace("Z","+00:00")),attendees=event.get("attendees",[]),raw_metadata=event))
    await session.commit(); return calendar_health(events)
