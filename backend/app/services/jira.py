from datetime import UTC, datetime, timedelta
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..models.integrations import Integration, IntegrationState, OAuthCredential
from .credentials import CredentialVault
class JiraClient:
    scopes = "read:jira-work write:jira-work offline_access"
    authorize_url = "https://auth.atlassian.com/authorize"
    async def access_token(self, code: str, redirect_uri: str) -> dict:
        return await self._token({"grant_type":"authorization_code","code":code,"redirect_uri":redirect_uri,"client_id":settings.jira_client_id,"client_secret":settings.jira_client_secret})
    async def _token(self, body: dict) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            response=await client.post("https://auth.atlassian.com/oauth/token", json=body); response.raise_for_status(); return response.json()
    async def token_for(self, session: AsyncSession, integration: Integration) -> str:
        credential = (await session.execute(select(OAuthCredential).where(OAuthCredential.integration_id == integration.id))).scalar_one_or_none()
        if not credential: raise RuntimeError("Jira credential missing")
        vault=CredentialVault()
        if credential.expires_at and credential.expires_at <= datetime.now(UTC)+timedelta(minutes=2):
            refreshed=await self._token({"grant_type":"refresh_token","client_id":settings.jira_client_id,"client_secret":settings.jira_client_secret,"refresh_token":vault.decrypt(credential.refresh_token_encrypted or "")})
            credential.access_token_encrypted=vault.encrypt(refreshed["access_token"]); credential.refresh_token_encrypted=vault.encrypt(refreshed["refresh_token"]); credential.expires_at=datetime.now(UTC)+timedelta(seconds=refreshed["expires_in"]); await session.commit()
        return vault.decrypt(credential.access_token_encrypted)
    async def resources(self, token: str) -> list[dict]:
        async with httpx.AsyncClient() as client:
            response=await client.get("https://api.atlassian.com/oauth/token/accessible-resources", headers={"Authorization":f"Bearer {token}"}); response.raise_for_status(); return response.json()
    async def request(self, token: str, cloud_id: str, method: str, path: str, **kwargs: object) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            response=await client.request(method, f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/{path.lstrip('/')}", headers={"Authorization":f"Bearer {token}","Accept":"application/json"}, **kwargs)
            response.raise_for_status(); return response.json() if response.content else {}
    async def projects(self, token: str, cloud_id: str) -> list[dict]: return await self.request(token, cloud_id, "GET", "project/search")
    async def create_issue(self, token: str, cloud_id: str, project_key: str, summary: str, description: str | None) -> dict: return await self.request(token, cloud_id, "POST", "issue", json={"fields":{"project":{"key":project_key},"summary":summary,"description":description or "","issuetype":{"name":"Task"}}})
    async def update_issue(self, token: str, cloud_id: str, issue_id: str, fields: dict) -> dict: return await self.request(token, cloud_id, "PUT", f"issue/{issue_id}", json={"fields":fields})
    async def issue(self, token: str, cloud_id: str, issue_id: str) -> dict: return await self.request(token, cloud_id, "GET", f"issue/{issue_id}?fields=status,summary,updated")
