import hashlib, hmac, time
import base64
import httpx
from fastapi import HTTPException
from ..config import settings
from ..models.work import TaskCandidate
class SlackClient:
    authorize_url="https://slack.com/oauth/v2/authorize"
    scopes="chat:write users:read users:read.email"
    async def access_token(self,code:str,redirect_uri:str)->dict:
        async with httpx.AsyncClient() as client:
            response=await client.post("https://slack.com/api/oauth.v2.access",data={"code":code,"redirect_uri":redirect_uri,"client_id":settings.slack_client_id,"client_secret":settings.slack_client_secret}); response.raise_for_status(); data=response.json()
        if not data.get("ok"): raise RuntimeError(data.get("error","Slack OAuth failed"))
        return {"access_token":data["access_token"],"scope":data.get("scope",""),"team":data.get("team",{})}
    async def team_users(self,token:str)->list[dict]:
        async with httpx.AsyncClient() as client:
            response=await client.get("https://slack.com/api/users.list",headers={"Authorization":f"Bearer {token}"}); response.raise_for_status(); data=response.json()
        if not data.get("ok"): raise RuntimeError(data.get("error","Slack users.list failed"))
        return data["members"]
def verify_slack(headers: dict[str,str], body: bytes) -> None:
    timestamp=headers.get("x-slack-request-timestamp","")
    signature=headers.get("x-slack-signature","")
    if not timestamp or not signature or abs(time.time()-int(timestamp)) > 300: raise HTTPException(401,"Invalid Slack request")
    expected="v0="+hmac.new(settings.slack_signing_secret.encode(), f"v0:{timestamp}:".encode()+body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,signature): raise HTTPException(401,"Invalid Slack signature")
def approval_blocks(candidate: TaskCandidate) -> list[dict]:
    deadline=candidate.due_at.isoformat() if candidate.due_at else "Not specified"
    owner=candidate.owner_name or "Unassigned"
    return [{"type":"section","text":{"type":"mrkdwn","text":f"*Task approval needed* · confidence {candidate.confidence:.0%}\n*Task:* {candidate.title}\n*Owner:* {owner}\n*Deadline:* {deadline}"}},{"type":"actions","elements":[{"type":"button","text":{"type":"plain_text","text":"Approve"},"style":"primary","action_id":"closeloop_task_approve","value":str(candidate.id)},{"type":"button","text":{"type":"plain_text","text":"Edit"},"action_id":"closeloop_task_edit","value":str(candidate.id)},{"type":"button","text":{"type":"plain_text","text":"Reject"},"style":"danger","action_id":"closeloop_task_reject","value":str(candidate.id)}]}]
async def post_approval(token: str, channel: str, candidate: TaskCandidate) -> dict:
    async with httpx.AsyncClient() as client:
        response=await client.post("https://slack.com/api/chat.postMessage", headers={"Authorization":f"Bearer {token}"}, json={"channel":channel,"blocks":approval_blocks(candidate),"text":f"Task approval needed: {candidate.title}"}); response.raise_for_status(); return response.json()
