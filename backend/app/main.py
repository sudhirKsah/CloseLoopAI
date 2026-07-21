from contextlib import asynccontextmanager
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
from .db.base import Base
from .db.session import engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        import app.models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="CloseLoop API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://close-loop-ai.vercel.app",
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
@app.get("/health")
def health() -> dict: return {"status": "ok"}
@app.post("/internal/jobs/monitor")
def enqueue_monitoring() -> dict:
    job = celery.send_task("monitor.organizations")
    return {"job_id": job.id}
