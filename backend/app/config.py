from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://closeloop:closeloop@localhost:5432/closeloop"
    )
    redis_url: str = "redis://localhost:6379/0"
    recall_api_key: str = ""
    recall_region: str = "us-east-1"
    recall_workspace_verification_secret: str = ""
    recall_svix_webhook_secret: str | None = None
    public_api_base_url: str = "https://api.example.com"
    ai_provider: str = "openai"
    openai_api_key: str = ""
    meeting_extraction_model: str = "gpt-5.6"
    cerebras_api_key: str = ""
    cerebras_model: str = "gpt-oss-120b"
    task_auto_approve_confidence: float = 0.85
    credential_encryption_key: str = ""
    slack_signing_secret: str = ""
    jira_client_id: str = ""
    jira_client_secret: str = ""
    linear_client_id: str = ""
    linear_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    github_webhook_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@closeloop.ai"
    support_inbox: str = "support@closeloop.ai"
    payment_inbox: str = "payment@closeloop.ai"
    reports_dir: str = "/tmp/closeloop-reports"
    clerk_issuer: str = ""
    clerk_audience: str = ""
    clerk_jwks_url: str = ""
    slack_client_id: str = ""
    slack_client_secret: str = ""
    notion_client_id: str = ""
    notion_client_secret: str = ""
    clerk_secret_key: str = ""
    jwt_secret_key: str = "closeloop-dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 72
    monitoring_hour_utc: int = 3  # 08:30 IST
    kgmemory_base_url: str = "http://localhost:8001/v1"
    kgmemory_request_timeout: float = 20.0
    # Service account used to auto-provision a per-workspace kgmemory org + API
    # key so users never have to paste an API key. Matches the FIRST_SUPERUSER_*
    # credentials configured on the kgmemory service.
    kgmemory_service_email: str = ""
    kgmemory_service_password: str = ""
    frontend_url: str = "http://localhost:3000"
    # Razorpay (Indian payment gateway — supports UPI, cards, netbanking,
    # international cards). Test mode works without any legal paperwork.
    # Get keys from https://dashboard.razorpay.com/app/keys
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_currency: str = "INR"
    # cors_origins: list[str] = [
    #     "http://localhost:3000",
    # ]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
