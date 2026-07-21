import smtplib
from email.message import EmailMessage
import httpx
from ..config import settings
async def send_slack_dm(token:str,user_id:str,text:str)->None:
    async with httpx.AsyncClient() as client:
        opened=await client.post("https://slack.com/api/conversations.open",headers={"Authorization":f"Bearer {token}"},json={"users":user_id}); opened.raise_for_status(); channel=opened.json()["channel"]["id"]
        sent=await client.post("https://slack.com/api/chat.postMessage",headers={"Authorization":f"Bearer {token}"},json={"channel":channel,"text":text}); sent.raise_for_status()
def send_email(recipient:str,subject:str,body:str)->None:
    if not settings.smtp_host: raise RuntimeError("SMTP is not configured")
    message=EmailMessage(); message["Subject"]=subject; message["From"]=settings.smtp_from; message["To"]=recipient; message.set_content(body)
    with smtplib.SMTP(settings.smtp_host,settings.smtp_port) as server:
        if settings.smtp_username: server.login(settings.smtp_username,settings.smtp_password)
        server.send_message(message)
