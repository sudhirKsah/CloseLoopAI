import asyncio
from datetime import datetime
import httpx
from ..config import settings
class RecallAPIError(RuntimeError): pass
class RecallClient:
    def __init__(self) -> None:
        self.base_url = f"https://{settings.recall_region}.recall.ai/api/v1"
    async def create_bot(self, *, meeting_url: str, bot_name: str, join_at: datetime | None, metadata: dict) -> dict:
        body = {"meeting_url": meeting_url, "bot_name": bot_name, "metadata": metadata, "recording_config": {
            "video_mixed_mp4": None,
            "transcript": {"provider": {"recallai_streaming": {}}, "diarization": {"use_separate_streams_when_available": True}},
            "realtime_endpoints": [{"type": "webhook", "url": f"{settings.public_api_base_url}/api/v1/webhooks/recall/realtime", "events": ["transcript.data", "participant_events.speaker_changed"]}],
        }}
        if join_at: body["join_at"] = join_at.isoformat()
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0), headers={"Authorization": f"Token {settings.recall_api_key}", "Content-Type": "application/json"}) as client:
            for attempt in range(10):
                response = await client.post(f"{self.base_url}/bot/", json=body)
                if response.status_code == 507 and attempt < 9:
                    await asyncio.sleep(30 + min(attempt, 5)); continue
                if response.status_code in (429, 502, 503, 504) and attempt < 4:
                    await asyncio.sleep(float(response.headers.get("Retry-After", 1)) + attempt); continue
                if response.is_error: raise RecallAPIError(f"Create bot failed ({response.status_code}): {response.text[:500]}")
                return response.json()
        raise RecallAPIError("Create bot retry budget exhausted")
