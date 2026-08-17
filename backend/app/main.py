from contextlib import asynccontextmanager
import asyncio
import sys

# psycopg3 (async PostgreSQL driver) requires SelectorEventLoop on Windows.
# ProactorEventLoop (Windows default) is incompatible. This is a no-op on
# Linux/macOS where the default loop is already compatible.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .celery_app import celery
from .api.v1.recall import router as recall_router
from .api.v1.extractions import router as extraction_router
from .api.v1.approvals import router as approval_router
from .api.v1.integrations import router as integration_router
from .api.v1.slack import router as slack_router
from .api.v1.execution import router as execution_router
from .api.v1.auth import router as auth_router
from .api.v1.settings import router as settings_router
from .api.v1.workspaces import router as workspace_router
from .api.v1.members import router as members_router
from .api.v1.github_webhooks import router as github_webhooks_router
from .api.v1.kgmemory import router as kgmemory_router
from .api.v1.payments import router as payments_router
from .db.base import Base
from .db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        import app.models  # noqa: F401

        await conn.run_sync(Base.metadata.create_all)

    # Start the PM scheduler — runs auto-onboard and auto-check-in
    # periodically so the PM proactively reaches out to the team.
    from .services.pm_scheduler import start_pm_scheduler, stop_pm_scheduler

    await start_pm_scheduler()
    try:
        yield
    finally:
        await stop_pm_scheduler()


app = FastAPI(title="CloseLoop API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://close-loop-ai.vercel.app",
        "https://pathayo.com",
        "https://www.pathayo.com",
        "https://closeloop.pathayo.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(recall_router, prefix="/api/v1")
app.include_router(extraction_router, prefix="/api/v1")
app.include_router(approval_router, prefix="/api/v1")
app.include_router(integration_router, prefix="/api/v1")
app.include_router(slack_router, prefix="/api/v1")
app.include_router(execution_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(workspace_router, prefix="/api/v1")
app.include_router(members_router, prefix="/api/v1")
app.include_router(github_webhooks_router, prefix="/api/v1")
app.include_router(kgmemory_router, prefix="/api/v1")
app.include_router(payments_router, prefix="/api/v1")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/internal/jobs/monitor")
def enqueue_monitoring() -> dict:
    job = celery.send_task("monitor.organizations")
    return {"job_id": job.id}
