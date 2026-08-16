"""Email sending service using SMTP."""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from ..config import settings

_SUPPORT_FOOTER_HTML = (
    '<p style="color:#3f3f46;font-size:11px;text-align:center;margin:16px 0 0;">'
    f"Need help? Reply to this email or contact "
    f'<a href="mailto:{settings.support_inbox}" style="color:#6ee7b7;">'
    f"{settings.support_inbox}</a>"
    "</p>"
)
_SUPPORT_FOOTER_TEXT = f"\nNeed help? Reply to this email or contact {settings.support_inbox}"


def _send(to: str, subject: str, html: str, text: str) -> None:
    """Send an HTML+text email via SMTP. Raises on failure."""
    if not settings.smtp_host:
        raise RuntimeError("SMTP is not configured")
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg["Reply-To"] = settings.support_inbox
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_from, [to], msg.as_string())


def send_password_reset_email(to: str, display_name: str, reset_link: str) -> None:
    """Send a password reset email with a clickable link."""
    html = f"""\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:#09090b;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <span style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#6ee7b7;color:#09090b;font-weight:900;font-size:14px;">C</span>
      <span style="color:#fff;font-weight:600;font-size:16px;">CloseLoop</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:600;margin:0 0 16px;">Reset your password</h1>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hi {display_name},
    </p>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
      We received a request to reset your CloseLoop password. Click the button below
      to choose a new password. This link expires in 1 hour.
    </p>
    <a href="{reset_link}" style="display:inline-block;background:#6ee7b7;color:#09090b;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none;">
      Reset password
    </a>
    <p style="color:#52525b;font-size:12px;line-height:1.6;margin:24px 0 0;">
      If you didn't request this, you can safely ignore this email.
      Your password won't be changed unless you click the link above.
    </p>
  </div>
  {_SUPPORT_FOOTER_HTML}
  <p style="color:#3f3f46;font-size:11px;text-align:center;margin:16px 0 0;">
    © 2026 CloseLoop, Inc.
  </p>
</div>"""
    text = (
        f"CloseLoop — Reset your password\n\n"
        f"Hi {display_name},\n\n"
        f"We received a request to reset your CloseLoop password.\n"
        f"Click the link below to choose a new password. "
        f"This link expires in 1 hour.\n\n"
        f"{reset_link}\n\n"
        f"If you didn't request this, you can safely ignore this email.\n\n"
        f"© 2026 CloseLoop, Inc."
        f"{_SUPPORT_FOOTER_TEXT}"
    )
    _send(to, "CloseLoop — Reset your password", html, text)


def send_welcome_email(to: str, display_name: str) -> None:
    """Send a welcome email after signup."""
    html = f"""\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:#09090b;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <span style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#6ee7b7;color:#09090b;font-weight:900;font-size:14px;">C</span>
      <span style="color:#fff;font-weight:600;font-size:16px;">CloseLoop</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:600;margin:0 0 16px;">Welcome to CloseLoop</h1>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hi {display_name},
    </p>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Your workspace is ready. Send an AI bot to your next meeting and
      CloseLoop will track every decision until it ships.
    </p>
    <a href="{settings.frontend_url}/dashboard" style="display:inline-block;background:#6ee7b7;color:#09090b;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none;">
      Go to dashboard
    </a>
  </div>
  {_SUPPORT_FOOTER_HTML}
  <p style="color:#3f3f46;font-size:11px;text-align:center;margin:16px 0 0;">
    © 2026 CloseLoop, Inc.
  </p>
</div>"""
    text = (
        f"Welcome to CloseLoop\n\n"
        f"Hi {display_name},\n\n"
        f"Your workspace is ready. Visit {settings.frontend_url}/dashboard "
        f"to get started.\n\n"
        f"© 2026 CloseLoop, Inc."
        f"{_SUPPORT_FOOTER_TEXT}"
    )
    _send(to, "Welcome to CloseLoop", html, text)


def send_verification_email(to: str, display_name: str, verify_link: str) -> None:
    """Send an email verification link."""
    html = f"""\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <div style="background:#09090b;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <span style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#6ee7b7;color:#09090b;font-weight:900;font-size:14px;">C</span>
      <span style="color:#fff;font-weight:600;font-size:16px;">CloseLoop</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:600;margin:0 0 16px;">Verify your email</h1>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hi {display_name},
    </p>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Please verify your email address to activate your CloseLoop account.
      Click the button below to confirm. This link expires in 24 hours.
    </p>
    <a href="{verify_link}" style="display:inline-block;background:#6ee7b7;color:#09090b;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none;">
      Verify email
    </a>
    <p style="color:#52525b;font-size:12px;line-height:1.6;margin:24px 0 0;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  </div>
  {_SUPPORT_FOOTER_HTML}
  <p style="color:#3f3f46;font-size:11px;text-align:center;margin:16px 0 0;">
    © 2026 CloseLoop, Inc.
  </p>
</div>"""
    text = (
        f"CloseLoop — Verify your email\n\n"
        f"Hi {display_name},\n\n"
        f"Please verify your email address to activate your CloseLoop account.\n"
        f"Click the link below to confirm. This link expires in 24 hours.\n\n"
        f"{verify_link}\n\n"
        f"If you didn't create an account, you can safely ignore this email.\n\n"
        f"© 2026 CloseLoop, Inc."
        f"{_SUPPORT_FOOTER_TEXT}"
    )
    _send(to, "CloseLoop — Verify your email", html, text)
