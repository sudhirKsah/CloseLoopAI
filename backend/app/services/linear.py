from datetime import UTC, datetime, timedelta
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..models.integrations import Integration, OAuthCredential
from .credentials import CredentialVault
class LinearClient:
    scopes = "read write"
    authorize_url = "https://linear.app/oauth/authorize"
    async def access_token(self, code: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient() as client:
            response=await client.post("https://api.linear.app/oauth/token", json={"grant_type":"authorization_code","code":code,"redirect_uri":redirect_uri,"client_id":settings.linear_client_id,"client_secret":settings.linear_client_secret}); response.raise_for_status(); return response.json()
    async def token_for(self, session: AsyncSession, integration: Integration) -> str:
        credential=(await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id == integration.id))).scalar_one_or_none()
        if not credential: raise RuntimeError("Linear credential missing")
        vault=CredentialVault()
        if credential.expires_at and credential.expires_at <= datetime.now(UTC)+timedelta(minutes=2):
            async with httpx.AsyncClient() as client:
                response=await client.post("https://api.linear.app/oauth/token", json={"grant_type":"refresh_token","refresh_token":vault.decrypt(credential.refresh_token_encrypted or ""),"client_id":settings.linear_client_id,"client_secret":settings.linear_client_secret}); response.raise_for_status(); refreshed=response.json()
            credential.access_token_encrypted=vault.encrypt(refreshed["access_token"]); credential.refresh_token_encrypted=vault.encrypt(refreshed.get("refresh_token", vault.decrypt(credential.refresh_token_encrypted or ""))); credential.expires_at=datetime.now(UTC)+timedelta(seconds=refreshed.get("expires_in",3600)); await session.commit()
        return vault.decrypt(credential.access_token_encrypted)
    async def graphql(self, token: str, query: str, variables: dict | None=None) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            response=await client.post("https://api.linear.app/graphql", headers={"Authorization":f"Bearer {token}"}, json={"query":query,"variables":variables or {}}); response.raise_for_status(); payload=response.json()
        if payload.get("errors"): raise RuntimeError(str(payload["errors"]))
        return payload["data"]
    async def projects(self, token: str) -> list[dict]: return (await self.graphql(token, "{ projects { nodes { id name } } }"))["projects"]["nodes"]
    async def create_issue(self, token: str, team_id: str, title: str, description: str | None) -> dict: return (await self.graphql(token, "mutation($input:IssueCreateInput!){ issueCreate(input:$input){ success issue { id identifier status { name } } } }", {"input":{"teamId":team_id,"title":title,"description":description}}))["issueCreate"]["issue"]
    async def update_issue(self, token: str, issue_id: str, input_: dict) -> dict: return (await self.graphql(token, "mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ issue { id identifier status { name } } } }", {"id":issue_id,"input":input_}))["issueUpdate"]["issue"]
    async def issue(self, token: str, issue_id: str) -> dict: return (await self.graphql(token, "query($id:String!){ issue(id:$id){ id identifier title updatedAt status { name type } } }", {"id":issue_id}))["issue"]
