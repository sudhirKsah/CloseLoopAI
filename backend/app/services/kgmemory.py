"""Client for the kgmemory microservice (the team's knowledge-graph "PM brain").

kgmemory is a separate FastAPI service (see ../../../memory-pinchfast) that
ingests conversation facts into a per-organization knowledge graph and
exposes decision-support endpoints: hybrid context search, person
reliability, project health, and an AI project-manager reasoning layer
(`/pm/decide`, `/pm/check-in`). Pathayo treats it as its long-term memory
layer: meeting transcripts are pushed into kgmemory so that decisions,
commitments, and engineer reliability accumulate across meetings instead of
being scoped to a single extraction.

Each Pathayo workspace that wants this maps 1:1 to a kgmemory organization,
via an `Integration(provider=KGMEMORY)` row whose `config` holds the
kgmemory org's API key (Fernet-encrypted, same as other provider secrets)
under `api_key_encrypted`.
"""

import asyncio
import logging
import time
import uuid as _uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.integrations import Integration, IntegrationProvider, IntegrationState
from .credentials import CredentialVault

log = logging.getLogger(__name__)


class KGMemoryError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class KGMemoryClient:
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or settings.kgmemory_base_url).rstrip("/")

    async def _request(
        self, method: str, path: str, *, timeout: float | None = None, **kwargs: object
    ) -> dict:
        async with httpx.AsyncClient(
            base_url=self.base_url, timeout=timeout or settings.kgmemory_request_timeout
        ) as client:
            response = await client.request(
                method,
                path,
                headers={"X-API-Key": self.api_key},
                **kwargs,
            )
            if response.status_code >= 400:
                raise KGMemoryError(
                    f"kgmemory {method} {path} failed: {response.status_code} {response.text[:300]}",
                    status_code=response.status_code,
                )
            return response.json() if response.content else {}

    # ── memory / ingest ────────────────────────────────────────────────
    async def ingest(self, message: dict) -> dict:
        return await self._request("POST", "/memory/ingest", json=message)

    async def ingest_batch(self, messages: list[dict]) -> dict:
        return await self._request(
            "POST", "/memory/ingest/batch", json={"messages": messages}
        )

    async def ingest_status(self, request_id: str) -> dict:
        return await self._request("GET", f"/memory/ingest/{request_id}")

    async def add_fact(self, fact: dict) -> dict:
        return await self._request("POST", "/memory/facts", json=fact)

    async def list_facts(self, **filters: object) -> list[dict]:
        return await self._request("GET", "/memory/facts", params=filters)

    async def invalidate_fact(self, fact_id: str) -> None:
        await self._request("DELETE", f"/memory/facts/{fact_id}")

    async def summarize_meeting(
        self, transcript: str, participants: list[str], date: str | None, project: str | None
    ) -> dict:
        return await self._request(
            "POST",
            "/memory/meetings/summarize",
            json={
                "transcript": transcript,
                "participants": participants,
                "date": date,
                "project": project,
            },
        )

    # ── context engine ─────────────────────────────────────────────────
    async def search(
        self, query: str, max_facts: int = 20, rerank: bool = True
    ) -> dict:
        return await self._request(
            "POST",
            "/context/search",
            json={"query": query, "max_facts": max_facts, "rerank": rerank},
        )

    # ── people ─────────────────────────────────────────────────────────
    async def list_people(self) -> list[dict]:
        return await self._request("GET", "/people/")

    async def upsert_person(self, payload: dict) -> dict:
        return await self._request("POST", "/people/", json=payload)

    async def person(self, name: str) -> dict:
        return await self._request("GET", f"/people/{name}")

    async def person_contributions(self, name: str) -> dict:
        return await self._request("GET", f"/people/{name}/contributions")

    # ── projects / tasks ───────────────────────────────────────────────
    async def list_projects(self) -> list[dict]:
        return await self._request("GET", "/projects/")

    async def upsert_project(self, payload: dict) -> dict:
        return await self._request("POST", "/projects/", json=payload)

    async def list_tasks(self, project: str | None = None) -> list[dict]:
        return await self._request(
            "GET", "/projects/tasks", params={"project": project} if project else {}
        )

    async def create_task(self, payload: dict) -> dict:
        return await self._request("POST", "/projects/tasks", json=payload)

    async def assignment_recommendations(self, task_id: str) -> dict:
        return await self._request("GET", f"/projects/tasks/{task_id}/recommendations")

    async def assign_task(self, task_id: str, person: str) -> dict:
        return await self._request(
            "POST", f"/projects/tasks/{task_id}/assign", params={"person": person}
        )

    async def auto_assign_task(self, task_id: str) -> dict:
        return await self._request("POST", f"/projects/tasks/{task_id}/auto-assign")

    async def start_project_intake(self, founder: str, project_name: str | None) -> dict:
        return await self._request(
            "POST",
            "/projects/intake/start",
            json={"founder": founder, "project_name": project_name},
            timeout=self._PM_TIMEOUT,
        )

    async def continue_project_intake(
        self, founder: str, message: str, current_step: str, project_name: str | None
    ) -> dict:
        return await self._request(
            "POST",
            "/projects/intake/continue",
            json={
                "founder": founder,
                "message": message,
                "current_step": current_step,
                "project_name": project_name,
            },
            timeout=self._PM_TIMEOUT,
        )

    # ── PM brain ───────────────────────────────────────────────────────
    # PM endpoints invoke LLM calls which can take up to 90s (the LLM
    # timeout in memory-pinchfast). Use a longer client-side timeout so
    # we don't cut off the response before the LLM finishes.
    _PM_TIMEOUT = 120.0

    async def decide(self, payload: dict) -> dict:
        return await self._request("POST", "/pm/decide", json=payload, timeout=self._PM_TIMEOUT)

    async def infer_state(self) -> dict:
        return await self._request("POST", "/pm/infer-state", timeout=self._PM_TIMEOUT)

    async def check_in(self, person: str) -> dict:
        return await self._request("POST", "/pm/check-in", params={"person": person}, timeout=self._PM_TIMEOUT)

    async def check_in_auto(self) -> dict:
        return await self._request("POST", "/pm/check-in/auto", timeout=self._PM_TIMEOUT)

    async def list_decisions(self, with_outcome_only: bool = False, limit: int = 50) -> list[dict]:
        return await self._request(
            "GET",
            "/pm/decisions",
            params={"with_outcome_only": with_outcome_only, "limit": limit},
        )

    async def record_decision_outcome(
        self, decision_id: str, outcome: str, notes: str = ""
    ) -> dict:
        return await self._request(
            "POST",
            f"/pm/decisions/{decision_id}/outcome",
            json={"outcome": outcome, "notes": notes},
        )

    async def decision_accuracy(self) -> dict:
        return await self._request("GET", "/pm/decisions/accuracy")

    async def review_work(self, engineer: str, claim: str, project: str | None) -> dict:
        return await self._request(
            "POST",
            "/pm/review-work",
            json={"engineer": engineer, "claim": claim, "project": project},
        )

    async def plan_next_steps(self, engineer: str, review: dict) -> dict:
        return await self._request(
            "POST",
            "/pm/plan-next-steps",
            json={"engineer": engineer, "review": review},
        )

    async def founder_digest(self, audience: str = "founder_non_technical") -> dict:
        return await self._request(
            "POST", "/pm/founder-digest", json={"audience": audience}
        )

    # ── monitor / actions ──────────────────────────────────────────────
    async def list_alerts(self, status: str = "open", limit: int = 50) -> list[dict]:
        return await self._request(
            "GET", "/monitor/alerts", params={"alert_status": status, "limit": limit}
        )

    async def monitor_scan(self) -> dict:
        return await self._request("POST", "/monitor/scan")

    async def escalate_alerts(self) -> dict:
        return await self._request("POST", "/monitor/escalate")

    async def acknowledge_alert(self, alert_id: str) -> dict:
        return await self._request("POST", f"/monitor/alerts/{alert_id}/ack")

    async def list_actions(self, status: str = "pending", limit: int = 50) -> list[dict]:
        return await self._request(
            "GET", "/actions", params={"action_status": status, "limit": limit}
        )

    async def complete_action(self, action_id: str) -> dict:
        return await self._request("POST", f"/actions/{action_id}/complete")

    # ── reports ────────────────────────────────────────────────────────
    async def request_report(self, payload: dict) -> dict:
        return await self._request("POST", "/reports/", json=payload, timeout=self._PM_TIMEOUT)

    async def report_status(self, report_id: str) -> dict:
        return await self._request("GET", f"/reports/{report_id}")

    # ── onboarding ─────────────────────────────────────────────────────
    async def start_onboarding(self, name: str, role: str = "engineer") -> dict:
        return await self._request(
            "POST", "/onboarding/start", json={"name": name, "role": role},
            timeout=self._PM_TIMEOUT,
        )

    async def continue_onboarding(
        self, name: str, message: str, current_step: str
    ) -> dict:
        return await self._request(
            "POST",
            "/onboarding/continue",
            json={"name": name, "message": message, "current_step": current_step},
            timeout=self._PM_TIMEOUT,
        )

    async def onboarding_status(self, name: str) -> dict:
        return await self._request("GET", "/onboarding/status", params={"name": name})

    # ── planning ───────────────────────────────────────────────────────
    async def detect_scope_creep(self, project: str) -> dict:
        return await self._request("POST", "/planning/scope-creep", json={"project": project}, timeout=self._PM_TIMEOUT)

    async def analyze_dependencies(self, project: str | None = None) -> dict:
        return await self._request(
            "GET", "/planning/dependencies", params={"project": project} if project else {}
        )

    async def estimation_accuracy(self, person: str | None = None) -> dict:
        return await self._request(
            "GET", "/planning/estimation-accuracy", params={"person": person} if person else {}
        )

    async def prioritize_tasks(self, project: str | None = None) -> dict:
        return await self._request(
            "GET", "/planning/prioritize", params={"project": project} if project else {}
        )

    # ── sprints ────────────────────────────────────────────────────────
    async def list_sprints(self, project: str | None = None) -> list[dict]:
        return await self._request(
            "GET", "/sprints/", params={"project": project} if project else {}
        )

    async def create_sprint(self, payload: dict) -> dict:
        return await self._request("POST", "/sprints/create", json=payload)

    async def get_sprint(self, sprint_id: str) -> dict:
        return await self._request("GET", f"/sprints/{sprint_id}")

    async def plan_sprint(self, sprint_id: str) -> dict:
        return await self._request("POST", f"/sprints/{sprint_id}/plan")

    async def sprint_retrospective(self, sprint_id: str) -> dict:
        return await self._request("POST", f"/sprints/{sprint_id}/retrospective")

    async def list_milestones(self, project: str | None = None) -> list[dict]:
        return await self._request(
            "GET", "/sprints/milestones", params={"project": project} if project else {}
        )

    async def create_milestone(self, payload: dict) -> dict:
        return await self._request("POST", "/sprints/milestones", json=payload)

    async def roadmap(self, project: str | None = None) -> dict:
        return await self._request(
            "GET", "/sprints/roadmap", params={"project": project} if project else {}
        )

    async def capacity_forecast(self, project: str | None = None, weeks: int = 2) -> dict:
        return await self._request(
            "GET",
            "/sprints/capacity",
            params={"project": project, "weeks": weeks},
        )

    # ── stakeholders / budget ──────────────────────────────────────────
    async def stakeholder_update(self, stakeholder_type: str, project: str | None) -> dict:
        return await self._request(
            "POST",
            "/stakeholders/update",
            json={"stakeholder_type": stakeholder_type, "project": project},
        )

    async def set_budget(self, payload: dict) -> dict:
        return await self._request("POST", "/stakeholders/budget", json=payload)

    async def record_spend(self, payload: dict) -> dict:
        return await self._request("POST", "/stakeholders/budget/spend", json=payload)

    async def budget_status(self, project: str | None = None) -> dict:
        return await self._request(
            "GET", "/stakeholders/budget", params={"project": project} if project else {}
        )

    # ── team ───────────────────────────────────────────────────────────
    async def performance_feedback(self, engineer: str) -> dict:
        return await self._request(
            "POST", "/team/performance-feedback", json={"engineer": engineer}
        )

    async def team_morale(self) -> dict:
        return await self._request("POST", "/team/morale")


async def sync_meeting(session: AsyncSession, meeting_id: str) -> dict:
    """Push a meeting's transcript and extracted decisions into kgmemory so
    they become durable, cross-meeting facts (commitments, status updates,
    decisions) in the workspace's knowledge graph.
    """
    from ..models.meetings import Meeting, Speaker, Transcript, TranscriptChunk
    from ..models.work import Decision

    meeting = await session.get(Meeting, meeting_id)
    if not meeting:
        return {"status": "no_meeting"}
    client = await get_client_for_workspace(session, str(meeting.workspace_id))
    if not client:
        return {"status": "kgmemory_not_connected"}

    rows = (
        await session.execute(
            select(TranscriptChunk, Speaker)
            .join(Transcript, Transcript.id == TranscriptChunk.transcript_id)
            .outerjoin(Speaker, Speaker.id == TranscriptChunk.speaker_id)
            .where(
                Transcript.meeting_id == meeting.id,
                TranscriptChunk.is_final.is_(True),
            )
            .order_by(TranscriptChunk.sequence)
        )
    ).all()
    project = meeting.title or str(meeting.workspace_id)
    messages = [
        {
            "message": chunk.text,
            "speaker": speaker.display_name if speaker else "unknown",
            "speaker_role": "engineer",
            "channel": meeting.provider.value,
            "project": project,
        }
        for chunk, speaker in rows
        if chunk.text.strip()
    ]
    decisions = (
        (
            await session.execute(
                select(Decision).where(Decision.meeting_id == meeting.id)
            )
        )
        .scalars()
        .all()
    )
    messages += [
        {
            "message": f"Decision: {decision.title}. {decision.rationale or ''}".strip(),
            "speaker": "meeting",
            "speaker_role": "founder",
            "channel": "decision",
            "project": project,
        }
        for decision in decisions
    ]
    if not messages:
        return {"status": "no_content"}
    try:
        result = await client.ingest_batch(messages)
    except KGMemoryError as error:
        log.warning("kgmemory sync failed for meeting %s: %s", meeting_id, error)
        return {"status": "error", "detail": str(error)}
    return {"status": "queued", "message_count": len(messages), **result}


async def get_client_for_workspace(
    session: AsyncSession, workspace_id: str
) -> KGMemoryClient | None:
    """Return a configured KGMemoryClient for a workspace, or None if the
    workspace hasn't connected kgmemory yet."""
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.workspace_id == workspace_id,
                Integration.provider == IntegrationProvider.KGMEMORY,
            )
        )
    ).scalar_one_or_none()
    if not integration or not integration.config.get("api_key_encrypted"):
        return None
    api_key = CredentialVault().decrypt(integration.config["api_key_encrypted"])
    base_url = integration.config.get("base_url") or settings.kgmemory_base_url
    return KGMemoryClient(api_key, base_url)


# ── auto-provisioning ──────────────────────────────────────────────────────
#
# Instead of asking each workspace admin to paste a kgmemory API key, the
# platform provisions one automatically. A service account (matching kgmemory's
# FIRST_SUPERUSER_* credentials) logs into kgmemory via JWT, creates a dedicated
# organization (each gets its own isolated FalkorDB graph) and an API key for
# it, then stores that key — Fernet-encrypted — in the workspace's Integration
# row. From then on every proxied request uses that key transparently.


class KGMemoryAdminClient:
    """JWT-authenticated client for kgmemory's org/api-key management API.

    Used only server-side to provision per-workspace orgs. The service token is
    cached in-process for a bit less than kgmemory's JWT lifetime so we don't
    log in on every request.
    """

    _token: str | None = None
    _token_expires_at: float = 0.0
    _login_lock = asyncio.Lock()

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.kgmemory_base_url).rstrip("/")

    async def _login(self) -> str:
        async with httpx.AsyncClient(
            base_url=self.base_url, timeout=settings.kgmemory_request_timeout
        ) as client:
            response = await client.post(
                "/auth/login",
                data={
                    "username": settings.kgmemory_service_email,
                    "password": settings.kgmemory_service_password,
                },
            )
        if response.status_code >= 400:
            raise KGMemoryError(
                f"kgmemory service-account login failed: {response.status_code} {response.text[:300]}",
                status_code=response.status_code,
            )
        token = response.json().get("access_token")
        if not token:
            raise KGMemoryError("kgmemory login response missing access_token")
        # Refresh a little before the real expiry to avoid edge-case 401s.
        lifetime = max(settings.kgmemory_request_timeout, 60.0)
        self._token = token
        self._token_expires_at = time.monotonic() + lifetime
        return token

    async def _token_value(self) -> str:
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token
        async with self._login_lock:
            # Re-check after acquiring the lock — another coroutine may have
            # just refreshed it.
            if self._token and time.monotonic() < self._token_expires_at:
                return self._token
            return await self._login()

    async def _request(self, method: str, path: str, **kwargs: object) -> dict:
        token = await self._token_value()
        async with httpx.AsyncClient(
            base_url=self.base_url, timeout=settings.kgmemory_request_timeout
        ) as client:
            response = await client.request(
                method,
                path,
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
        if response.status_code >= 400:
            raise KGMemoryError(
                f"kgmemory admin {method} {path} failed: {response.status_code} {response.text[:300]}",
                status_code=response.status_code,
            )
        return response.json() if response.content else {}

    async def create_org(self, name: str, slug: str) -> dict:
        return await self._request(
            "POST", "/orgs/", json={"name": name, "slug": slug}
        )

    async def list_orgs(self) -> list[dict]:
        return await self._request("GET", "/orgs/")

    async def create_api_key(self, org_id: str, name: str) -> dict:
        return await self._request(
            "POST", f"/orgs/{org_id}/api-keys", json={"name": name}
        )


def _provisioning_slug(workspace_id: str) -> str:
    """Deterministic, unique slug for a workspace's kgmemory org."""
    return f"cl-{_uuid.UUID(str(workspace_id)).hex[:16]}"


async def provision_workspace(
    session: AsyncSession, workspace_id: str
) -> KGMemoryClient:
    """Create a kgmemory org + API key for the workspace and persist it.

    Idempotent: if an org with the workspace's slug already exists (e.g. a
    previous attempt failed before saving the key), we reuse it and issue a
    fresh API key. Safe to call repeatedly — once the Integration row exists
    with a key, callers should use `ensure_client_for_workspace` instead.
    """
    if not settings.kgmemory_service_email or not settings.kgmemory_service_password:
        raise KGMemoryError(
            "kgmemory auto-provisioning is not configured: set "
            "KGMEMORY_SERVICE_EMAIL and KGMEMORY_SERVICE_PASSWORD"
        )
    admin = KGMemoryAdminClient()
    slug = _provisioning_slug(workspace_id)
    name = f"Pathayo {_uuid.UUID(str(workspace_id)).hex[:8]}"
    try:
        org = await admin.create_org(name=name, slug=slug)
    except KGMemoryError as error:
        if error.status_code != 409:
            raise
        # Org already exists from a partial prior run — reuse it.
        orgs = await admin.list_orgs()
        org = next((o for o in orgs if o.get("slug") == slug), None)
        if org is None:
            raise KGMemoryError(
                f"kgmemory org slug '{slug}' is taken but not owned by the service account"
            )
    api_key = await admin.create_api_key(org["id"], name=f"closeloop-{slug}")
    raw_key = api_key["key"]
    config = {"api_key_encrypted": CredentialVault().encrypt(raw_key)}
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.workspace_id == workspace_id,
                Integration.provider == IntegrationProvider.KGMEMORY,
            )
        )
    ).scalar_one_or_none()
    if integration:
        integration.config = config
        integration.state = IntegrationState.CONNECTED
        integration.external_account_id = str(org["id"])
    else:
        integration = Integration(
            workspace_id=workspace_id,
            provider=IntegrationProvider.KGMEMORY,
            external_account_id=str(org["id"]),
            config=config,
        )
        session.add(integration)
    await session.commit()
    log.info("auto-provisioned kgmemory org %s for workspace %s", org["id"], workspace_id)
    return KGMemoryClient(raw_key, admin.base_url)


async def ensure_client_for_workspace(
    session: AsyncSession, workspace_id: str
) -> KGMemoryClient:
    """Return a kgmemory client for the workspace, provisioning one on demand.

    This is the auto-connect path: the moment a workspace touches any kgmemory
    endpoint (including the status check), a dedicated org + API key is created
    if it doesn't already exist, so users never have to configure anything.
    """
    client = await get_client_for_workspace(session, workspace_id)
    if client is not None:
        return client
    return await provision_workspace(session, workspace_id)
