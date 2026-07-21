import secrets, uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from ...config import settings
from ...db.session import get_session
from ...models.integrations import Integration, IntegrationProvider, IntegrationState, OAuthCredential, OAuthState
from ...services.credentials import CredentialVault
from ...services.jira import JiraClient
from ...services.linear import LinearClient
from ...services.github import GithubClient, sync_repo_activity
from ...services.calendar import CalendarClient, sync_calendar
from ...services.slack import SlackClient
from ...services.notion import NotionClient
from ...models.integrations import GithubRepo
from ...models.core import ExternalIdentity, User, WorkspaceMember, MemberRole
from ...api.deps import current_user
router=APIRouter(prefix="/integrations",tags=["integrations"])
def client(provider: IntegrationProvider):
    if provider==IntegrationProvider.JIRA: return JiraClient()
    if provider==IntegrationProvider.LINEAR: return LinearClient()
    if provider==IntegrationProvider.GITHUB: return GithubClient()
    if provider in (IntegrationProvider.GOOGLE_CALENDAR,IntegrationProvider.MICROSOFT_CALENDAR): return CalendarClient(provider)
    if provider==IntegrationProvider.SLACK: return SlackClient()
    if provider==IntegrationProvider.NOTION: return NotionClient()
    raise HTTPException(400,"Unsupported OAuth provider")
@router.get("/{provider}/connect")
async def connect(provider:IntegrationProvider,workspace_id:uuid.UUID,user_id:uuid.UUID,redirect_uri:str,user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->dict:
    if provider not in (IntegrationProvider.JIRA,IntegrationProvider.LINEAR,IntegrationProvider.GITHUB,IntegrationProvider.GOOGLE_CALENDAR,IntegrationProvider.MICROSOFT_CALENDAR,IntegrationProvider.SLACK,IntegrationProvider.NOTION): raise HTTPException(400,"Unsupported OAuth provider")
    membership=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==workspace_id,WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if user.id!=user_id or not membership or membership.role.value not in ("owner","admin"): raise HTTPException(403,"Workspace admin access required")
    state=secrets.token_urlsafe(32); session.add(OAuthState(provider=provider,workspace_id=workspace_id,user_id=user_id,state=state,redirect_uri=redirect_uri,expires_at=datetime.now(UTC)+timedelta(minutes=10))); await session.commit()
    app=client(provider); client_id={IntegrationProvider.JIRA:settings.jira_client_id,IntegrationProvider.LINEAR:settings.linear_client_id,IntegrationProvider.GITHUB:settings.github_client_id,IntegrationProvider.GOOGLE_CALENDAR:settings.google_client_id,IntegrationProvider.MICROSOFT_CALENDAR:settings.microsoft_client_id,IntegrationProvider.SLACK:settings.slack_client_id,IntegrationProvider.NOTION:settings.notion_client_id}[provider]; params={"response_type":"code","client_id":client_id,"redirect_uri":redirect_uri,"state":state,"scope":app.scopes,"prompt":"consent"}
    if provider==IntegrationProvider.JIRA: params["audience"]="api.atlassian.com"
    if provider==IntegrationProvider.GOOGLE_CALENDAR: params.update({"access_type":"offline","include_granted_scopes":"true"})
    if provider==IntegrationProvider.NOTION: params["owner"]="user"
    return {"authorization_url":app.authorize_url+"?"+urlencode(params)}
@router.get("/{provider}/callback")
async def callback(provider:IntegrationProvider,code:str,state:str,session:AsyncSession=Depends(get_session))->dict:
    record=(await session.execute(select(OAuthState).where(OAuthState.provider==provider,OAuthState.state==state,OAuthState.expires_at>datetime.now(UTC)))).scalar_one_or_none()
    if not record: raise HTTPException(400,"OAuth state is invalid or expired")
    tokens=await client(provider).access_token(code,record.redirect_uri)
    integration=(await session.execute(select(Integration).where(Integration.workspace_id==record.workspace_id,Integration.provider==provider))).scalar_one_or_none()
    if not integration: integration=Integration(workspace_id=record.workspace_id,provider=provider,external_account_id="default",config={}); session.add(integration); await session.flush()
    vault=CredentialVault(); credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id==integration.id))).scalar_one_or_none()
    values=dict(integration_id=integration.id,access_token_encrypted=vault.encrypt(tokens["access_token"]),refresh_token_encrypted=vault.encrypt(tokens["refresh_token"]) if tokens.get("refresh_token") else None,expires_at=datetime.now(UTC)+timedelta(seconds=tokens.get("expires_in",3600)),scopes=tokens.get("scope","").split())
    if credential:
        for key,value in values.items(): setattr(credential,key,value)
    else: session.add(OAuthCredential(**values))
    if provider==IntegrationProvider.JIRA:
        resources=await JiraClient().resources(tokens["access_token"]); integration.config={"resources":resources,"cloud_id":resources[0]["id"]} if resources else {}
    if provider==IntegrationProvider.SLACK: integration.external_account_id=tokens.get("team",{}).get("id","default"); integration.config={"team":tokens.get("team",{})}
    await session.delete(record); await session.commit()
    return {"connected":True,"integration_id":str(integration.id),"config":integration.config}
@router.get("/github/{integration_id}/repositories")
async def github_repositories(integration_id:uuid.UUID,session:AsyncSession=Depends(get_session))->dict:
    integration=await session.get(Integration,integration_id)
    if not integration or integration.provider!=IntegrationProvider.GITHUB: raise HTTPException(404,"GitHub integration not found")
    return {"repositories":await GithubClient().repositories(await GithubClient().token_for(session,integration))}
@router.post("/github/{integration_id}/repositories/{owner}/{name}")
async def select_github_repository(integration_id:uuid.UUID,owner:str,name:str,session:AsyncSession=Depends(get_session))->dict:
    integration=await session.get(Integration,integration_id)
    if not integration or integration.provider!=IntegrationProvider.GITHUB: raise HTTPException(404,"GitHub integration not found")
    full_name=f"{owner}/{name}"; repo=(await session.execute(select(GithubRepo).where(GithubRepo.integration_id==integration_id,GithubRepo.full_name==full_name))).scalar_one_or_none()
    if not repo: repo=GithubRepo(integration_id=integration_id,github_node_id=full_name,full_name=full_name); session.add(repo); await session.commit()
    return {"repo_id":str(repo.id),"full_name":repo.full_name}
@router.post("/github/repos/{repo_id}/sync")
async def sync_github_repository(repo_id:uuid.UUID,session:AsyncSession=Depends(get_session))->dict:
    repo=await session.get(GithubRepo,repo_id)
    if not repo: raise HTTPException(404,"Repository not found")
    return {"inserted":await sync_repo_activity(session,repo)}
@router.post("/calendar/{integration_id}/sync")
async def sync_connected_calendar(integration_id:uuid.UUID,user_id:uuid.UUID,session:AsyncSession=Depends(get_session))->dict:
    integration=await session.get(Integration,integration_id)
    if not integration or integration.provider not in (IntegrationProvider.GOOGLE_CALENDAR,IntegrationProvider.MICROSOFT_CALENDAR): raise HTTPException(404,"Calendar integration not found")
    return await sync_calendar(session,integration,str(user_id))
@router.post("/slack/{integration_id}/directory-sync")
async def sync_slack_directory(integration_id:uuid.UUID,session:AsyncSession=Depends(get_session))->dict:
    integration=await session.get(Integration,integration_id)
    if not integration or integration.provider!=IntegrationProvider.SLACK: raise HTTPException(404,"Slack integration not found")
    credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id==integration.id))).scalar_one_or_none()
    if not credential: raise HTTPException(400,"Slack credential missing")
    count=0
    for member in await SlackClient().team_users(CredentialVault().decrypt(credential.access_token_encrypted)):
        profile=member.get("profile",{}); email=profile.get("email")
        if member.get("deleted") or member.get("is_bot") or not email: continue
        person=(await session.execute(select(User).where(User.email==email))).scalar_one_or_none()
        if not person: person=User(email=email,display_name=profile.get("real_name") or member.get("real_name") or member["id"],is_login_enabled=False); session.add(person); await session.flush()
        identity=(await session.execute(select(ExternalIdentity).where(ExternalIdentity.provider=="slack",ExternalIdentity.external_user_id==member["id"]))).scalar_one_or_none()
        if not identity: session.add(ExternalIdentity(user_id=person.id,provider="slack",external_user_id=member["id"]))
        membership=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==integration.workspace_id,WorkspaceMember.user_id==person.id))).scalar_one_or_none()
        if not membership: session.add(WorkspaceMember(workspace_id=integration.workspace_id,user_id=person.id,role=MemberRole.MEMBER))
        count+=1
    await session.commit(); return {"synced_people":count}
@router.get("/jira/{integration_id}/projects")
async def jira_projects(integration_id:uuid.UUID,session:AsyncSession=Depends(get_session))->dict:
    integration=await session.get(Integration,integration_id)
    if not integration or integration.provider!=IntegrationProvider.JIRA: raise HTTPException(404,"Jira integration not found")
    token=await JiraClient().token_for(session,integration); return await JiraClient().projects(token,integration.config["cloud_id"])
@router.get("/linear/{integration_id}/projects")
async def linear_projects(integration_id:uuid.UUID,session:AsyncSession=Depends(get_session))->dict:
    integration=await session.get(Integration,integration_id)
    if not integration or integration.provider!=IntegrationProvider.LINEAR: raise HTTPException(404,"Linear integration not found")
    return {"projects":await LinearClient().projects(await LinearClient().token_for(session,integration))}
@router.delete("/{integration_id}", status_code=204)
async def disconnect_integration(integration_id:uuid.UUID,user:User=Depends(current_user),session:AsyncSession=Depends(get_session))->None:
    integration=await session.get(Integration,integration_id)
    if not integration: raise HTTPException(404,"Integration not found")
    member=(await session.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id==integration.workspace_id,WorkspaceMember.user_id==user.id))).scalar_one_or_none()
    if not member or member.role.value not in ("owner","admin"): raise HTTPException(403,"Workspace admin access required")
    await session.execute(delete(OAuthCredential).where(OAuthCredential.integration_id==integration.id))
    integration.state=IntegrationState.DISCONNECTED; integration.config={**integration.config,"disconnected_at":datetime.now(UTC).isoformat()}
    await session.commit()
