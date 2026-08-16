#!/usr/bin/env python3
"""Quick test: send a test email via Resend SMTP to verify domain config."""
import os
import sys
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "backend"))

from app.config import settings

TO = "pathayoservice@gmail.com"
SUBJECT = "CloseLoop — Test email from mail.pathayo.com"
HTML = """\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:#09090b;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
    <h1 style="color:#fff;font-size:20px;">Test email</h1>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;">
      This is a test email from CloseLoop sent via Resend SMTP using
      the custom domain <strong>mail.pathayo.com</strong>.
    </p>
    <p style="color:#a1a1aa;font-size:14px;">
      Reply-To is set to <a href="mailto:{support}" style="color:#6ee7b7;">{support}</a>.
    </p>
  </div>
</div>""".format(support=settings.support_inbox)
TEXT = (
    "CloseLoop — Test email\n\n"
    f"This is a test email sent via Resend SMTP using mail.pathayo.com.\n"
    f"Reply-To: {settings.support_inbox}\n"
)

msg = MIMEMultipart("alternative")
msg["From"] = settings.smtp_from
msg["To"] = TO
msg["Subject"] = SUBJECT
msg["Reply-To"] = settings.support_inbox
msg.attach(MIMEText(TEXT, "plain"))
msg.attach(MIMEText(HTML, "html"))

print(f"From:    {settings.smtp_from}")
print(f"To:      {TO}")
print(f"Reply-To: {settings.support_inbox}")
print(f"Host:    {settings.smtp_host}:{settings.smtp_port}")
print("Sending...")

with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
    server.starttls()
    server.login(settings.smtp_username, settings.smtp_password)
    server.sendmail(settings.smtp_from, [TO], msg.as_string())

print("SUCCESS — email sent to", TO)
