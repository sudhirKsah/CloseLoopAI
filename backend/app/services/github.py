from datetime import UTC, datetime, timedelta
import re
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..models.integrations import GithubActivity, GithubRepo, Integration, OAuthCredential
from ..models.work import Task, TaskActivityMatch
from .credentials import CredentialVault
class GithubClient:
    authorize_url="https://github.com/login/oauth/authorize"; scopes="repo read:user"
    async def access_token(self, code:str, redirect_uri:str)->dict:
        async with httpx.AsyncClient() as client:
            r=await client.post("https://github.com/login/oauth/access_token",headers={"Accept":"application/json"},json={"client_id":settings.github_client_id,"client_secret":settings.github_client_secret,"code":code,"redirect_uri":redirect_uri}); r.raise_for_status(); return r.json()
    async def token_for(self,session:AsyncSession,integration:Integration)->str:
        credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id==integration.id))).scalar_one()
        return CredentialVault().decrypt(credential.access_token_encrypted)
    async def get(self,token:str,path:str,params:dict|None=None)->object:
        async with httpx.AsyncClient(timeout=20) as client:
            r=await client.get("https://api.github.com"+path,params=params,headers={"Authorization":f"Bearer {token}","Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}); r.raise_for_status(); return r.json()
    async def repositories(self,token:str)->list[dict]: return await self.get(token,"/user/repos",{"per_page":100,"affiliation":"owner,collaborator,organization_member","sort":"updated"}) # type: ignore[return-value]
    async def readme(self,token:str,full_name:str)->str|None:
        try:
            data=await self.get(token,f"/repos/{full_name}/readme"); import base64; return base64.b64decode(data["content"]).decode(errors="replace")[:12000] # type: ignore[index]
        except httpx.HTTPStatusError: return None
    async def activity(self,token:str,full_name:str,since:datetime)->list[tuple[str,dict]]:
        params={"per_page":100,"since":since.isoformat()}; commits=await self.get(token,f"/repos/{full_name}/commits",params)
        prs=await self.get(token,f"/repos/{full_name}/pulls",{"state":"all","sort":"updated","direction":"desc","per_page":100})
        issues=await self.get(token,f"/repos/{full_name}/issues",{"state":"closed","since":since.isoformat(),"per_page":100})
        return [("commit",x) for x in commits]+[("pull_request_merged" if x.get("merged_at") else "pull_request",x) for x in prs if x.get("updated_at")]+[("issue_closed",x) for x in issues]
async def sync_repo_activity(session:AsyncSession,repo:GithubRepo)->int:
    integration=await session.get(Integration,repo.integration_id)
    if not integration: return 0
    client=GithubClient(); token=await client.token_for(session,integration); since=datetime.now(UTC)-timedelta(days=7); inserted=0
    for kind,payload in await client.activity(token,repo.full_name,since):
        external_id=str(payload.get("node_id") or payload.get("sha") or payload["id"])
        exists=(await session.execute(select(GithubActivity.id).where(GithubActivity.repo_id==repo.id,GithubActivity.external_id==external_id))).scalar_one_or_none()
        if exists: continue
        author=(payload.get("author") or payload.get("user") or {}).get("login"); activity=GithubActivity(repo_id=repo.id,external_id=external_id,activity_type=kind,occurred_at=datetime.now(UTC),payload=payload); session.add(activity); inserted+=1
        await session.flush(); await map_activity(session,activity,repo)
    await session.commit(); return inserted
async def map_activity(session:AsyncSession,activity:GithubActivity,repo:GithubRepo)->None:
    text=" ".join(str(x) for x in [activity.payload.get("commit",{}).get("message",""),activity.payload.get("title",""),activity.payload.get("body","")]).casefold()
    tasks=(await session.execute(select(Task).where(Task.workspace_id==(await session.get(Integration,repo.integration_id)).workspace_id,Task.state.in_(["open","in_progress","blocked","overdue"])))).scalars().all()
    for task in tasks:
        tokens={token for token in re.findall(r"[a-z0-9]{4,}",task.title.casefold())}
        overlap=sum(token in text for token in tokens)
        if overlap:
            confidence=min(.95,.45+overlap*.12); session.add(TaskActivityMatch(task_id=task.id,github_activity_id=activity.id,confidence=confidence,reason="Task-title keyword overlap in selected repository"))
            task.execution_score=min(100,task.execution_score+ (14 if activity.activity_type=="pull_request_merged" else 7)*confidence); task.last_activity_at=activity.occurred_at
async def detect_inactivity(session:AsyncSession,workspace_id:str,days:int=3)->list[Task]:
    cutoff=datetime.now(UTC)-timedelta(days=days); tasks=(await session.execute(select(Task).where(Task.workspace_id==workspace_id,Task.last_activity_at<cutoff,Task.state.in_(["open","in_progress"])))).scalars().all()
    for task in tasks: task.execution_score=max(0,task.execution_score-8)
    await session.commit(); return tasks
