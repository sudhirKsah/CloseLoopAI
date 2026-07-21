import base64, binascii, hashlib, hmac, time
from fastapi import HTTPException, status
class RecallSignatureVerifier:
    """Svix-compatible verifier for Recall workspace or legacy webhook secrets."""
    def __init__(self, secret: str, max_age_seconds: int = 300):
        self.secret, self.max_age_seconds = secret, max_age_seconds
    def verify(self, headers: dict[str, str], raw_body: bytes) -> str:
        event_id = headers.get("webhook-id") or headers.get("svix-id")
        timestamp = headers.get("webhook-timestamp") or headers.get("svix-timestamp")
        signatures = headers.get("webhook-signature") or headers.get("svix-signature")
        if not event_id or not timestamp or not signatures or not self.secret.startswith("whsec_"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unverified Recall request")
        try:
            if abs(time.time() - int(timestamp)) > self.max_age_seconds: raise ValueError("stale")
            key = base64.b64decode(self.secret.removeprefix("whsec_"))
            expected = base64.b64encode(hmac.new(key, event_id.encode() + b"." + timestamp.encode() + b"." + raw_body, hashlib.sha256).digest()).decode()
            valid = any(version == "v1" and hmac.compare_digest(value, expected) for item in signatures.split() if "," in item for version, value in [item.split(",", 1)])
        except (ValueError, TypeError, binascii.Error):
            valid = False
        if not valid: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Recall signature")
        return event_id
