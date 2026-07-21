import base64, httpx
from ..config import settings
class NotionClient:
    authorize_url="https://api.notion.com/v1/oauth/authorize"
    scopes=""
    async def access_token(self,code:str,redirect_uri:str)->dict:
        basic=base64.b64encode(f"{settings.notion_client_id}:{settings.notion_client_secret}".encode()).decode()
        async with httpx.AsyncClient() as client:
            response=await client.post("https://api.notion.com/v1/oauth/token",headers={"Authorization":f"Basic {basic}","Notion-Version":"2026-03-11"},json={"grant_type":"authorization_code","code":code,"redirect_uri":redirect_uri}); response.raise_for_status(); return response.json()
