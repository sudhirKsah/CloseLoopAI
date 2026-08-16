"""HTTP proxy from CloseLoop to the kgmemory microservice.

Every workspace that has connected the `kgmemory` integration (see
`/integrations/kgmemory/connect`) gets a thin pass-through API here so the
frontend can reach the memory service's PM-brain, monitor, planning, sprints,
stakeholders, team, reports, and people endpoints through the CloseLoop
backend (using the workspace's own JWT auth) instead of needing the raw
kgmemory API key in the browser.

All routes are scoped to a workspace and require the caller to be a member of
it. If kgmemory isn't connected for the workspace, every route returns 409.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.deps import current_user
from ...db.session import get_session
from ...models.core import ExternalIdentity, User, WorkspaceMember
from ...models.integrations import (
    Integration,
    IntegrationProvider,
    OAuthCredential,
)
from ...services.credentials import CredentialVault
from ...services.kgmemory import KGMemoryError, get_client_for_workspace
from ...services.slack import send_dm

router = APIRouter(prefix="/workspaces/{workspace_id}/kgmemory", tags=["kgmemory"])


async def _require_member(
    workspace_id: uuid.UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceMember:
    member = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


async def _client(
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    session: AsyncSession = Depends(get_session),
):
    client = await get_client_for_workspace(session, str(workspace_id))
    if client is None:
        raise HTTPException(409, "Knowledge Graph Memory is not connected for this workspace")
    return client


def _wrap(error: KGMemoryError) -> HTTPException:
    # kgmemory errors already carry the upstream status + body snippet.
    return HTTPException(502, f"kgmemory upstream error: {error}")


# ── request models ────────────────────────────────────────────────────────


class IngestMessage(BaseModel):
    message: str
    speaker: str
    speaker_role: str = "other"
    channel: str = "api"
    project: str | None = None
    timestamp: str | None = None


class BatchIngest(BaseModel):
    messages: list[IngestMessage] = Field(min_length=1, max_length=500)


class AddFact(BaseModel):
    subject: str
    predicate: str
    value: str
    fact_kind: str = "fact"
    topics: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    project: str | None = None
    task: str | None = None


class MeetingSummary(BaseModel):
    transcript: str = Field(min_length=10, max_length=50000)
    participants: list[str] = Field(default_factory=list)
    date: str | None = None
    project: str | None = None


class SearchRequest(BaseModel):
    query: str
    max_facts: int = 20
    rerank: bool = True


class PersonCreate(BaseModel):
    name: str
    role: str = "other"
    title: str | None = None
    skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    is_technical: bool = False
    experience_years: float | None = None
    availability_hours_per_week: float | None = None
    timezone: str | None = None
    interests: list[str] = Field(default_factory=list)
    career_goals: str | None = None
    resume_summary: str | None = None


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "planning"
    deadline: str | None = None


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    project: str
    required_skills: list[str] = Field(default_factory=list)
    estimated_days: float | None = None
    deadline: str | None = None


class DecideRequest(BaseModel):
    query: str
    audience: str = "founder_non_technical"
    project: str | None = None
    max_facts: int = 20
    rerank: bool = True


class DecisionOutcome(BaseModel):
    outcome: str
    notes: str = ""


class ReviewWorkRequest(BaseModel):
    engineer: str
    claim: str
    project: str | None = None


class PlanNextStepsRequest(BaseModel):
    engineer: str
    review: dict


class FounderDigestRequest(BaseModel):
    audience: str = "founder_non_technical"


class ReportRequest(BaseModel):
    report_type: str = "weekly"
    language: str = "en"
    project: str | None = None


class OnboardingStart(BaseModel):
    name: str
    role: str = "engineer"


class OnboardingContinue(BaseModel):
    name: str
    message: str
    current_step: str


class ScopeCreepRequest(BaseModel):
    project: str


class SprintCreate(BaseModel):
    project: str
    goal: str
    sprint_days: int = 14
    start_date: str | None = None


class MilestoneCreate(BaseModel):
    project: str
    title: str
    target_date: str
    description: str | None = None


class StakeholderUpdateRequest(BaseModel):
    stakeholder_type: str
    project: str | None = None


class BudgetSetRequest(BaseModel):
    project: str
    total_budget: float
    currency: str = "USD"
    start_date: str | None = None
    end_date: str | None = None


class SpendRequest(BaseModel):
    project: str
    amount: float
    category: str = "general"
    description: str | None = None


class FeedbackRequest(BaseModel):
    engineer: str


# ── status / connection ───────────────────────────────────────────────────


@router.get("/status")
async def status(
    workspace_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    client = await get_client_for_workspace(session, str(workspace_id))
    return {"connected": client is not None}


# ── memory / ingest ───────────────────────────────────────────────────────


@router.post("/memory/ingest")
async def ingest(body: IngestMessage, client=Depends(_client)) -> dict:
    try:
        return await client.ingest(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/memory/ingest/batch")
async def ingest_batch(body: BatchIngest, client=Depends(_client)) -> dict:
    try:
        return await client.ingest_batch([m.model_dump(exclude_none=True) for m in body.messages])
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/memory/ingest/{request_id}")
async def ingest_status(request_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.ingest_status(request_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/memory/facts")
async def add_fact(body: AddFact, client=Depends(_client)) -> dict:
    try:
        return await client.add_fact(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/memory/facts")
async def list_facts(
    client=Depends(_client),
    subject: str | None = Query(None),
    topic: str | None = Query(None),
    project: str | None = Query(None),
    fact_kind: str | None = Query(None),
    current_only: bool = Query(True),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
    try:
        return await client.list_facts(
            subject=subject,
            topic=topic,
            project=project,
            fact_kind=fact_kind,
            current_only=current_only,
            limit=limit,
        )
    except KGMemoryError as e:
        raise _wrap(e)


@router.delete("/memory/facts/{fact_id}")
async def invalidate_fact(fact_id: str, client=Depends(_client)) -> dict:
    try:
        await client.invalidate_fact(fact_id)
        return {"invalidated": fact_id}
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/memory/meetings/summarize")
async def summarize_meeting(body: MeetingSummary, client=Depends(_client)) -> dict:
    try:
        return await client.summarize_meeting(
            body.transcript, body.participants, body.date, body.project
        )
    except KGMemoryError as e:
        raise _wrap(e)


# ── context engine ────────────────────────────────────────────────────────


@router.post("/context/search")
async def search(body: SearchRequest, client=Depends(_client)) -> dict:
    try:
        return await client.search(body.query, max_facts=body.max_facts, rerank=body.rerank)
    except KGMemoryError as e:
        raise _wrap(e)


# ── people ────────────────────────────────────────────────────────────────


@router.get("/people")
async def list_people(client=Depends(_client)) -> list[dict]:
    try:
        return await client.list_people()
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/people")
async def upsert_person(body: PersonCreate, client=Depends(_client)) -> dict:
    try:
        return await client.upsert_person(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/people/{name}")
async def get_person(name: str, client=Depends(_client)) -> dict:
    try:
        return await client.person(name)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/people/{name}/contributions")
async def person_contributions(name: str, client=Depends(_client)) -> dict:
    try:
        return await client.person_contributions(name)
    except KGMemoryError as e:
        raise _wrap(e)


# ── projects / tasks ──────────────────────────────────────────────────────


@router.get("/projects")
async def list_projects(client=Depends(_client)) -> list[dict]:
    try:
        return await client.list_projects()
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/projects")
async def upsert_project(body: ProjectCreate, client=Depends(_client)) -> dict:
    try:
        return await client.upsert_project(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/projects/tasks")
async def list_tasks(
    client=Depends(_client), project: str | None = Query(None)
) -> list[dict]:
    try:
        return await client.list_tasks(project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/projects/tasks")
async def create_task(body: TaskCreate, client=Depends(_client)) -> dict:
    try:
        return await client.create_task(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/projects/tasks/{task_id}/recommendations")
async def assignment_recommendations(task_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.assignment_recommendations(task_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/projects/tasks/{task_id}/assign")
async def assign_task(task_id: str, person: str = Query(...), client=Depends(_client)) -> dict:
    try:
        return await client.assign_task(task_id, person)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/projects/tasks/{task_id}/auto-assign")
async def auto_assign_task(task_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.auto_assign_task(task_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/projects/intake/start")
async def start_intake(
    body: dict, client=Depends(_client)
) -> dict:
    try:
        return await client.start_project_intake(body["founder"], body.get("project_name"))
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/projects/intake/continue")
async def continue_intake(body: dict, client=Depends(_client)) -> dict:
    try:
        return await client.continue_project_intake(
            body["founder"], body["message"], body["current_step"], body.get("project_name")
        )
    except KGMemoryError as e:
        raise _wrap(e)


# ── PM brain ──────────────────────────────────────────────────────────────


@router.post("/pm/decide")
async def decide(body: DecideRequest, client=Depends(_client)) -> dict:
    try:
        return await client.decide(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/infer-state")
async def infer_state(client=Depends(_client)) -> dict:
    try:
        return await client.infer_state()
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/check-in")
async def check_in(person: str = Query(...), client=Depends(_client)) -> dict:
    try:
        return await client.check_in(person)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/check-in/auto")
async def check_in_auto(client=Depends(_client)) -> dict:
    try:
        return await client.check_in_auto()
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/pm/decisions")
async def list_decisions(
    client=Depends(_client),
    with_outcome_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    try:
        return await client.list_decisions(with_outcome_only, limit)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/decisions/{decision_id}/outcome")
async def record_decision_outcome(
    decision_id: str, body: DecisionOutcome, client=Depends(_client)
) -> dict:
    try:
        return await client.record_decision_outcome(decision_id, body.outcome, body.notes)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/pm/decisions/accuracy")
async def decision_accuracy(client=Depends(_client)) -> dict:
    try:
        return await client.decision_accuracy()
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/review-work")
async def review_work(body: ReviewWorkRequest, client=Depends(_client)) -> dict:
    try:
        return await client.review_work(body.engineer, body.claim, body.project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/plan-next-steps")
async def plan_next_steps(body: PlanNextStepsRequest, client=Depends(_client)) -> dict:
    try:
        return await client.plan_next_steps(body.engineer, body.review)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/pm/founder-digest")
async def founder_digest(body: FounderDigestRequest, client=Depends(_client)) -> dict:
    try:
        return await client.founder_digest(body.audience)
    except KGMemoryError as e:
        raise _wrap(e)


# ── monitor / actions ─────────────────────────────────────────────────────


@router.get("/monitor/alerts")
async def list_alerts(
    client=Depends(_client),
    alert_status: str = Query("open"),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    try:
        return await client.list_alerts(alert_status, limit)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/monitor/scan")
async def monitor_scan(client=Depends(_client)) -> dict:
    try:
        return await client.monitor_scan()
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/monitor/escalate")
async def escalate_alerts(client=Depends(_client)) -> dict:
    try:
        return await client.escalate_alerts()
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/monitor/alerts/{alert_id}/ack")
async def acknowledge_alert(alert_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.acknowledge_alert(alert_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/actions")
async def list_actions(
    client=Depends(_client),
    action_status: str = Query("pending"),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    try:
        return await client.list_actions(action_status, limit)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/actions/{action_id}/complete")
async def complete_action(action_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.complete_action(action_id)
    except KGMemoryError as e:
        raise _wrap(e)


# ── reports ───────────────────────────────────────────────────────────────


@router.post("/reports")
async def request_report(body: ReportRequest, client=Depends(_client)) -> dict:
    try:
        return await client.request_report(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/reports/{report_id}")
async def report_status(report_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.report_status(report_id)
    except KGMemoryError as e:
        raise _wrap(e)


# ── onboarding ────────────────────────────────────────────────────────────


@router.post("/onboarding/start")
async def start_onboarding(body: OnboardingStart, client=Depends(_client)) -> dict:
    try:
        return await client.start_onboarding(body.name, body.role)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/onboarding/continue")
async def continue_onboarding(body: OnboardingContinue, client=Depends(_client)) -> dict:
    try:
        return await client.continue_onboarding(body.name, body.message, body.current_step)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/onboarding/status")
async def onboarding_status(name: str = Query(...), client=Depends(_client)) -> dict:
    try:
        return await client.onboarding_status(name)
    except KGMemoryError as e:
        raise _wrap(e)


# ── slack delivery ────────────────────────────────────────────────────────
# These endpoints combine a kgmemory PM operation with actual Slack delivery.
# They generate a PM message (check-in, onboarding question, work review) via
# the memory service, then send it as a DM to the engineer on Slack.


async def _slack_token_for_workspace(
    session: AsyncSession, workspace_id: uuid.UUID
) -> str | None:
    """Return the decrypted Slack OAuth token for a workspace, or None."""
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.workspace_id == workspace_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
    ).scalar_one_or_none()
    if not integration:
        return None
    credential = (
        await session.execute(
            select(OAuthCredential).where(
                OAuthCredential.integration_id == integration.id
            )
        )
    ).scalar_one_or_none()
    if not credential:
        return None
    return CredentialVault().decrypt(credential.access_token_encrypted)


async def _slack_user_id_for_name(
    session: AsyncSession, workspace_id: uuid.UUID, name: str
) -> str | None:
    """Look up a person's Slack user id by matching their display name or
    email against workspace members. The kgmemory person name is typically a
    first name or full name in lowercase; we do a case-insensitive match."""
    # Try exact display_name match first
    members = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id
            )
        )
    ).scalars().all()
    user_ids = [m.user_id for m in members]
    if not user_ids:
        return None
    users = (
        await session.execute(
            select(User).where(User.id.in_(user_ids))
        )
    ).scalars().all()
    name_lower = name.strip().lower()
    for user in users:
        if user.display_name and user.display_name.strip().lower() == name_lower:
            identity = (
                await session.execute(
                    select(ExternalIdentity).where(
                        ExternalIdentity.provider == "slack",
                        ExternalIdentity.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if identity:
                return identity.external_user_id
    # Fallback: partial / first-name match
    for user in users:
        if user.display_name and name_lower in user.display_name.strip().lower():
            identity = (
                await session.execute(
                    select(ExternalIdentity).where(
                        ExternalIdentity.provider == "slack",
                        ExternalIdentity.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if identity:
                return identity.external_user_id
    return None


class SlackCheckInRequest(BaseModel):
    person: str


@router.post("/pm/check-in/slack")
async def check_in_and_send_slack(
    body: SlackCheckInRequest,
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    client=Depends(_client),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate a PM check-in message and send it to the person on Slack."""
    try:
        result = await client.check_in(body.person)
    except KGMemoryError as e:
        raise _wrap(e)
    if not result.get("needed") or not result.get("check_in_message"):
        return result
    token = await _slack_token_for_workspace(session, workspace_id)
    if not token:
        return {**result, "slack_sent": False, "slack_error": "Slack not connected"}
    slack_id = await _slack_user_id_for_name(session, workspace_id, body.person)
    if not slack_id:
        return {**result, "slack_sent": False, "slack_error": f"No Slack user found for '{body.person}'"}
    try:
        await send_dm(token, slack_id, result["check_in_message"])
        return {**result, "slack_sent": True, "slack_user_id": slack_id}
    except Exception as exc:
        return {**result, "slack_sent": False, "slack_error": str(exc)}


class SlackOnboardingStartRequest(BaseModel):
    name: str
    role: str = "engineer"


@router.post("/onboarding/start/slack")
async def start_onboarding_and_send_slack(
    body: SlackOnboardingStartRequest,
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    client=Depends(_client),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Start onboarding and send the first question to the engineer on Slack."""
    try:
        result = await client.start_onboarding(body.name, body.role)
    except KGMemoryError as e:
        raise _wrap(e)
    message = result.get("message")
    if not message:
        return result
    token = await _slack_token_for_workspace(session, workspace_id)
    if not token:
        return {**result, "slack_sent": False, "slack_error": "Slack not connected"}
    slack_id = await _slack_user_id_for_name(session, workspace_id, body.name)
    if not slack_id:
        return {**result, "slack_sent": False, "slack_error": f"No Slack user found for '{body.name}'"}
    try:
        await send_dm(token, slack_id, message)
        return {**result, "slack_sent": True, "slack_user_id": slack_id}
    except Exception as exc:
        return {**result, "slack_sent": False, "slack_error": str(exc)}


class SlackOnboardingContinueRequest(BaseModel):
    name: str
    message: str
    current_step: str


@router.post("/onboarding/continue/slack")
async def continue_onboarding_and_send_slack(
    body: SlackOnboardingContinueRequest,
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    client=Depends(_client),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Continue onboarding and send the next question to the engineer on Slack."""
    try:
        result = await client.continue_onboarding(body.name, body.message, body.current_step)
    except KGMemoryError as e:
        raise _wrap(e)
    message = result.get("message")
    if not message:
        return result
    token = await _slack_token_for_workspace(session, workspace_id)
    if not token:
        return {**result, "slack_sent": False, "slack_error": "Slack not connected"}
    slack_id = await _slack_user_id_for_name(session, workspace_id, body.name)
    if not slack_id:
        return {**result, "slack_sent": False, "slack_error": f"No Slack user found for '{body.name}'"}
    try:
        await send_dm(token, slack_id, message)
        return {**result, "slack_sent": True, "slack_user_id": slack_id}
    except Exception as exc:
        return {**result, "slack_sent": False, "slack_error": str(exc)}


class SlackReviewWorkRequest(BaseModel):
    engineer: str
    claim: str
    project: str | None = None


@router.post("/pm/review-work/slack")
async def review_work_and_send_slack(
    body: SlackReviewWorkRequest,
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    client=Depends(_client),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Review an engineer's work claim and send them feedback on Slack."""
    try:
        result = await client.review_work(body.engineer, body.claim, body.project)
    except KGMemoryError as e:
        raise _wrap(e)
    # Send the honest review to the engineer
    message = result.get("honest_review") or result.get("what_is_missing")
    if not message:
        return result
    token = await _slack_token_for_workspace(session, workspace_id)
    if not token:
        return {**result, "slack_sent": False, "slack_error": "Slack not connected"}
    slack_id = await _slack_user_id_for_name(session, workspace_id, body.engineer)
    if not slack_id:
        return {**result, "slack_sent": False, "slack_error": f"No Slack user found for '{body.engineer}'"}
    try:
        await send_dm(token, slack_id, message)
        return {**result, "slack_sent": True, "slack_user_id": slack_id}
    except Exception as exc:
        return {**result, "slack_sent": False, "slack_error": str(exc)}


# ── automated pm ──────────────────────────────────────────────────────────
# These endpoints trigger the autonomous PM: it scans the workspace and
# initiates conversations on Slack without manual per-person triggering.


@router.post("/pm/auto-onboard")
async def auto_onboard(
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Automatically start onboarding for all workspace members who haven't
    been onboarded yet. Sends the first PM question to each person on Slack."""
    from ...services.pm_automation import auto_onboard_new_members

    results = await auto_onboard_new_members(session, workspace_id)
    return {"results": results, "count": len(results)}


@router.post("/pm/auto-check-in")
async def auto_check_in(
    workspace_id: uuid.UUID,
    _member: WorkspaceMember = Depends(_require_member),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Automatically detect who needs a check-in and send messages on Slack."""
    from ...services.pm_automation import auto_check_in as _auto_check_in

    results = await _auto_check_in(session, workspace_id)
    return {"results": results, "count": len(results)}


# ── planning ──────────────────────────────────────────────────────────────


@router.post("/planning/scope-creep")
async def detect_scope_creep(body: ScopeCreepRequest, client=Depends(_client)) -> dict:
    try:
        return await client.detect_scope_creep(body.project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/planning/dependencies")
async def analyze_dependencies(
    client=Depends(_client), project: str | None = Query(None)
) -> dict:
    try:
        return await client.analyze_dependencies(project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/planning/estimation-accuracy")
async def estimation_accuracy(
    client=Depends(_client), person: str | None = Query(None)
) -> dict:
    try:
        return await client.estimation_accuracy(person)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/planning/prioritize")
async def prioritize_tasks(
    client=Depends(_client), project: str | None = Query(None)
) -> dict:
    try:
        return await client.prioritize_tasks(project)
    except KGMemoryError as e:
        raise _wrap(e)


# ── sprints ───────────────────────────────────────────────────────────────


@router.get("/sprints")
async def list_sprints(
    client=Depends(_client), project: str | None = Query(None)
) -> list[dict]:
    try:
        return await client.list_sprints(project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/sprints")
async def create_sprint(body: SprintCreate, client=Depends(_client)) -> dict:
    try:
        return await client.create_sprint(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/sprints/{sprint_id}")
async def get_sprint(sprint_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.get_sprint(sprint_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/sprints/{sprint_id}/plan")
async def plan_sprint(sprint_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.plan_sprint(sprint_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/sprints/{sprint_id}/retrospective")
async def sprint_retrospective(sprint_id: str, client=Depends(_client)) -> dict:
    try:
        return await client.sprint_retrospective(sprint_id)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/sprints/milestones")
async def list_milestones(
    client=Depends(_client), project: str | None = Query(None)
) -> list[dict]:
    try:
        return await client.list_milestones(project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/sprints/milestones")
async def create_milestone(body: MilestoneCreate, client=Depends(_client)) -> dict:
    try:
        return await client.create_milestone(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/sprints/roadmap")
async def roadmap(
    client=Depends(_client), project: str | None = Query(None)
) -> dict:
    try:
        return await client.roadmap(project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/sprints/capacity")
async def capacity_forecast(
    client=Depends(_client),
    project: str | None = Query(None),
    weeks: int = Query(2, ge=1, le=12),
) -> dict:
    try:
        return await client.capacity_forecast(project, weeks)
    except KGMemoryError as e:
        raise _wrap(e)


# ── stakeholders / budget ─────────────────────────────────────────────────


@router.post("/stakeholders/update")
async def stakeholder_update(body: StakeholderUpdateRequest, client=Depends(_client)) -> dict:
    try:
        return await client.stakeholder_update(body.stakeholder_type, body.project)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/stakeholders/budget")
async def set_budget(body: BudgetSetRequest, client=Depends(_client)) -> dict:
    try:
        return await client.set_budget(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/stakeholders/budget/spend")
async def record_spend(body: SpendRequest, client=Depends(_client)) -> dict:
    try:
        return await client.record_spend(body.model_dump(exclude_none=True))
    except KGMemoryError as e:
        raise _wrap(e)


@router.get("/stakeholders/budget")
async def budget_status(
    client=Depends(_client), project: str | None = Query(None)
) -> dict:
    try:
        return await client.budget_status(project)
    except KGMemoryError as e:
        raise _wrap(e)


# ── team ──────────────────────────────────────────────────────────────────


@router.post("/team/performance-feedback")
async def performance_feedback(body: FeedbackRequest, client=Depends(_client)) -> dict:
    try:
        return await client.performance_feedback(body.engineer)
    except KGMemoryError as e:
        raise _wrap(e)


@router.post("/team/morale")
async def team_morale(client=Depends(_client)) -> dict:
    try:
        return await client.team_morale()
    except KGMemoryError as e:
        raise _wrap(e)
