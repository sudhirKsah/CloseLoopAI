from datetime import datetime
from pydantic import AnyHttpUrl, BaseModel, Field, field_validator
from ..models.meetings import MeetingProvider
class CreateRecallBotRequest(BaseModel):
    workspace_id: str
    meeting_url: AnyHttpUrl
    title: str | None = Field(default=None, max_length=500)
    bot_name: str = Field(default="CloseLoop Notetaker", min_length=1, max_length=100)
    join_at: datetime | None = None
    provider: MeetingProvider | None = None
    @field_validator("meeting_url")
    @classmethod
    def allowed_provider(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        host = value.host or ""
        if not any(key in host for key in ("meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "slack.com")):
            raise ValueError("Only Google Meet, Zoom, Microsoft Teams, and Slack Huddle URLs are supported")
        return value
