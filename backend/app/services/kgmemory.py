"""Client for the kgmemory microservice (the team's knowledge-graph "PM brain").

kgmemory is a separate FastAPI service (see ../../../memory-closeloop) that
ingests conversation facts into a per-organization knowledge graph and
exposes decision-support endpoints: hybrid context search, person
reliability, project health, and an AI project-manager reasoning layer
(`/pm/decide`, `/pm/check-in`). CloseLoop treats it as its long-term memory
layer: meeting transcripts are pushed into kgmemory so that decisions,
commitments, and engineer reliability accumulate across meetings instead of
being scoped to a single extraction.

Each CloseLoop workspace that wants this maps 1:1 to a kgmemory organization,
via an `Integration(provider=KGMEMORY)` row whose `config` holds the
kgmemory org's API key (Fernet-encrypted, same as other provider secrets)
under `api_key_encrypted`.
"""

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.integrations import Integration, IntegrationProvider
from .credentials import CredentialVault

log = logging.getLogger(__name__)


class KGMemoryError(RuntimeError):
    pass


class KGMemoryClient:
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or settings.kgmemory_base_url).rstrip("/")

    async def _request(self, method: str, path: str, **kwargs: object) -> dict:
        async with httpx.AsyncClient(
            base_url=self.base_url, timeout=settings.kgmemory_request_timeout
        ) as client:
            response = await client.request(
                method,
                path,
                headers={"X-API-Key": self.api_key},
                **kwargs,
            )
            if response.status_code >= 400:
                raise KGMemoryError(
                    f"kgmemory {method} {path} failed: {response.status_code} {response.text[:300]}"
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
        )

    # ── PM brain ───────────────────────────────────────────────────────
    async def decide(self, payload: dict) -> dict:
        return await self._request("POST", "/pm/decide", json=payload)

    async def infer_state(self) -> dict:
        return await self._request("POST", "/pm/infer-state")

    async def check_in(self, person: str) -> dict:
        return await self._request("POST", "/pm/check-in", params={"person": person})

    async def check_in_auto(self) -> dict:
        return await self._request("POST", "/pm/check-in/auto")

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
        return await self._request("POST", "/reports/", json=payload)

    async def report_status(self, report_id: str) -> dict:
        return await self._request("GET", f"/reports/{report_id}")

    # ── onboarding ─────────────────────────────────────────────────────
    async def start_onboarding(self, name: str, role: str = "engineer") -> dict:
        return await self._request(
            "POST", "/onboarding/start", json={"name": name, "role": role}
        )

    async def continue_onboarding(
        self, name: str, message: str, current_step: str
    ) -> dict:
        return await self._request(
            "POST",
            "/onboarding/continue",
            json={"name": name, "message": message, "current_step": current_step},
        )

    async def onboarding_status(self, name: str) -> dict:
        return await self._request("GET", "/onboarding/status", params={"name": name})

    # ── planning ───────────────────────────────────────────────────────
    async def detect_scope_creep(self, project: str) -> dict:
        return await self._request("POST", "/planning/scope-creep", json={"project": project})

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
