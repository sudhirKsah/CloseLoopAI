from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import re
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings


def verify_github_signature(signature_256: str | None, body: bytes) -> bool:
    """Verify a GitHub webhook's X-Hub-Signature-256 (HMAC-SHA256) header."""
    if not settings.github_webhook_secret:
        return False
    expected = (
        "sha256="
        + hmac.new(
            settings.github_webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
    )
    return bool(signature_256) and hmac.compare_digest(expected, signature_256)
from ..models.integrations import (
    GithubActivity,
    GithubRepo,
    Integration,
    OAuthCredential,
)
from ..models.work import Task, TaskActivityMatch
from .credentials import CredentialVault


class GithubClient:
    authorize_url = "https://github.com/login/oauth/authorize"
    scopes = "repo read:user admin:repo_hook"

    async def access_token(self, code: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                json={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
            r.raise_for_status()
            return r.json()

    async def token_for(self, session: AsyncSession, integration: Integration) -> str:
        credential = (
            await session.execute(
                select(OAuthCredential).where(
                    OAuthCredential.integration_id == integration.id
                )
            )
        ).scalar_one()
        return CredentialVault().decrypt(credential.access_token_encrypted)

    async def get(self, token: str, path: str, params: dict | None = None) -> object:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                "https://api.github.com" + path,
                params=params,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            r.raise_for_status()
            return r.json()

    async def paginate(
        self, token: str, path: str, params: dict | None = None, max_pages: int = 10
    ) -> list[dict]:
        """Follow GitHub's page parameter up to a cap so busy repos don't get
        silently truncated at 100 items."""
        results: list[dict] = []
        params = {**(params or {}), "per_page": 100}
        for page in range(1, max_pages + 1):
            batch = await self.get(token, path, {**params, "page": page})
            if not isinstance(batch, list) or not batch:
                break
            results.extend(batch)
            if len(batch) < 100:
                break
        return results

    async def repositories(self, token: str) -> list[dict]:
        return await self.paginate(
            token,
            "/user/repos",
            {
                "affiliation": "owner,collaborator,organization_member",
                "sort": "updated",
            },
        )

    async def ensure_webhook(self, token: str, full_name: str) -> dict | None:
        """Best-effort: register a push/PR/issues webhook on the repo so we get
        real-time events. Returns None if it can't (no secret/public URL, or
        insufficient permissions) — the hourly poller still covers those repos."""
        if not settings.github_webhook_secret or not settings.public_api_base_url:
            return None
        hook_url = f"{settings.public_api_base_url.rstrip('/')}/api/v1/webhooks/github"
        config = {
            "url": hook_url,
            "content_type": "json",
            "secret": settings.github_webhook_secret,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
            try:
                existing = await client.get(
                    f"https://api.github.com/repos/{full_name}/hooks", headers=headers
                )
                existing.raise_for_status()
                for hook in existing.json():
                    if (hook.get("config") or {}).get("url") == hook_url:
                        return hook  # already registered
                created = await client.post(
                    f"https://api.github.com/repos/{full_name}/hooks",
                    headers=headers,
                    json={
                        "name": "web",
                        "active": True,
                        "events": ["push", "pull_request", "issues"],
                        "config": config,
                    },
                )
                created.raise_for_status()
                return created.json()
            except httpx.HTTPStatusError:
                return None

    async def readme(self, token: str, full_name: str) -> str | None:
        try:
            data = await self.get(token, f"/repos/{full_name}/readme")
            import base64

            return base64.b64decode(data["content"]).decode(errors="replace")[:12000]  # type: ignore[index]
        except httpx.HTTPStatusError:
            return None

    async def activity(
        self, token: str, full_name: str, since: datetime
    ) -> list[tuple[str, dict]]:
        commits = await self.paginate(
            token, f"/repos/{full_name}/commits", {"since": since.isoformat()}
        )
        prs = await self.paginate(
            token,
            f"/repos/{full_name}/pulls",
            {"state": "all", "sort": "updated", "direction": "desc"},
        )
        issues = await self.paginate(
            token,
            f"/repos/{full_name}/issues",
            {"state": "closed", "since": since.isoformat()},
        )
        return (
            [("commit", x) for x in commits]
            + [
                ("pull_request_merged" if x.get("merged_at") else "pull_request", x)
                for x in prs
                if x.get("updated_at")
            ]
            # GitHub's issues endpoint also returns PRs; skip those to avoid dupes.
            + [("issue_closed", x) for x in issues if "pull_request" not in x]
        )


def _activity_timestamp(kind: str, payload: dict) -> datetime:
    """Use the real event time from GitHub, not ingestion time."""
    raw = None
    if kind == "commit":
        raw = (payload.get("commit") or {}).get("author", {}).get("date")
    elif kind == "pull_request_merged":
        raw = payload.get("merged_at")
    elif kind == "pull_request":
        raw = payload.get("updated_at") or payload.get("created_at")
    elif kind == "issue_closed":
        raw = payload.get("closed_at") or payload.get("updated_at")
    if raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(UTC)


def _activity_author(payload: dict) -> str | None:
    return (payload.get("author") or payload.get("user") or {}).get("login")


async def ingest_activity(
    session: AsyncSession,
    repo: GithubRepo,
    kind: str,
    payload: dict,
    workspace_id,
) -> bool:
    """Idempotently store one activity and match it to tasks. Shared by the
    webhook (primary) and the polling fallback. Returns True if newly inserted.
    Caller is responsible for committing."""
    external_id = str(payload.get("node_id") or payload.get("sha") or payload.get("id"))
    if not external_id or external_id == "None":
        return False
    exists = (
        await session.execute(
            select(GithubActivity.id).where(
                GithubActivity.repo_id == repo.id,
                GithubActivity.external_id == external_id,
            )
        )
    ).scalar_one_or_none()
    if exists:
        return False
    actor_id = await _resolve_actor(session, workspace_id, _activity_author(payload))
    activity = GithubActivity(
        repo_id=repo.id,
        external_id=external_id,
        activity_type=kind,
        actor_id=actor_id,
        occurred_at=_activity_timestamp(kind, payload),
        payload=payload,
    )
    session.add(activity)
    await session.flush()
    await map_activity(session, activity, repo)
    return True


async def sync_repo_activity(session: AsyncSession, repo: GithubRepo) -> int:
    integration = await session.get(Integration, repo.integration_id)
    if not integration:
        return 0
    client = GithubClient()
    token = await client.token_for(session, integration)
    since = datetime.now(UTC) - timedelta(days=7)
    inserted = 0
    for kind, payload in await client.activity(token, repo.full_name, since):
        if await ingest_activity(
            session, repo, kind, payload, integration.workspace_id
        ):
            inserted += 1
    await session.commit()
    return inserted


def activities_from_webhook(
    event_type: str, payload: dict
) -> list[tuple[str, dict]]:
    """Normalize a GitHub webhook payload into the same (kind, item) shape the
    poller produces, so both paths share matching/attribution logic."""
    items: list[tuple[str, dict]] = []
    if event_type == "push":
        for commit in payload.get("commits", []) or []:
            sha = commit.get("id") or commit.get("sha")
            items.append(
                (
                    "commit",
                    {
                        "sha": sha,
                        "node_id": sha,
                        "commit": {
                            "message": commit.get("message", ""),
                            "author": {"date": commit.get("timestamp")},
                        },
                        "author": {
                            "login": (commit.get("author") or {}).get("username")
                        },
                    },
                )
            )
    elif event_type == "pull_request":
        pr = payload.get("pull_request") or {}
        if payload.get("action") in ("closed", "opened", "reopened", "synchronize"):
            items.append(
                ("pull_request_merged" if pr.get("merged") else "pull_request", pr)
            )
    elif event_type == "issues":
        if payload.get("action") == "closed":
            items.append(("issue_closed", payload.get("issue") or {}))
    return items


async def process_webhook_event(
    session: AsyncSession, event_type: str, payload: dict
) -> int:
    """Handle an inbound GitHub webhook: route to the matching registered
    repo(s) and ingest each derived activity."""
    full_name = (payload.get("repository") or {}).get("full_name")
    if not full_name:
        return 0
    repos = (
        (
            await session.execute(
                select(GithubRepo).where(
                    GithubRepo.full_name == full_name,
                    GithubRepo.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    inserted = 0
    for repo in repos:
        integration = await session.get(Integration, repo.integration_id)
        if not integration:
            continue
        for kind, item in activities_from_webhook(event_type, payload):
            if await ingest_activity(
                session, repo, kind, item, integration.workspace_id
            ):
                inserted += 1
    await session.commit()
    return inserted


async def _resolve_actor(session: AsyncSession, workspace_id, login: str | None):
    """Map a GitHub login to a directory member via their linked github id."""
    if not login:
        return None
    from ..models.core import ExternalIdentity, WorkspaceMember

    row = (
        await session.execute(
            select(ExternalIdentity)
            .join(WorkspaceMember, WorkspaceMember.user_id == ExternalIdentity.user_id)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                ExternalIdentity.provider == "github",
                ExternalIdentity.external_user_id == login,
            )
        )
    ).scalar_one_or_none()
    return row.user_id if row else None


async def map_activity(
    session: AsyncSession, activity: GithubActivity, repo: GithubRepo
) -> None:
    payload = activity.payload
    branch = (payload.get("head") or {}).get("ref", "")
    text = " ".join(
        str(x)
        for x in [
            payload.get("commit", {}).get("message", ""),
            payload.get("title", ""),
            payload.get("body", ""),
            branch,
        ]
    ).casefold()
    workspace_id = (await session.get(Integration, repo.integration_id)).workspace_id
    tasks = (
        (
            await session.execute(
                select(Task).where(
                    Task.workspace_id == workspace_id,
                    Task.state.in_(["open", "in_progress", "blocked", "overdue"]),
                )
            )
        )
        .scalars()
        .all()
    )
    # Explicit references like "CL-<task-id-prefix>" or a Jira/Linear key present
    # in the task's external refs are the strongest signal; keyword overlap is a
    # weaker fallback. Same actor as the task owner adds a small boost.
    for task in tasks:
        confidence, reason = _match_confidence(task, activity, text, branch)
        if confidence <= 0:
            continue
        if activity.actor_id and task.owner_id == activity.actor_id:
            confidence = min(0.98, confidence + 0.1)
            reason += "; authored by task owner"
        session.add(
            TaskActivityMatch(
                task_id=task.id,
                github_activity_id=activity.id,
                confidence=round(confidence, 2),
                reason=reason,
            )
        )
        task.execution_score = min(
            100,
            task.execution_score
            + (14 if activity.activity_type == "pull_request_merged" else 7)
            * confidence,
        )
        task.last_activity_at = activity.occurred_at


def _match_confidence(
    task: Task, activity: GithubActivity, text: str, branch: str
) -> tuple[float, str]:
    # 1) Explicit external key reference (Jira/Linear key stored on the task).
    for ref in (task.external_refs or {}).values():
        key = str(ref).casefold()
        if len(key) >= 4 and key in text:
            return 0.95, f"References external key {ref}"
    # 2) Task id prefix used as a reference tag, e.g. branch feat/cl-1a2b3c4d.
    short_id = str(task.id).replace("-", "")[:8]
    if short_id and short_id in text.replace("-", ""):
        return 0.9, "References task id"
    # 3) Keyword overlap between the task title and the change text/branch.
    tokens = {t for t in re.findall(r"[a-z0-9]{4,}", task.title.casefold())}
    overlap = sum(token in text for token in tokens)
    if overlap >= 2:
        return min(0.85, 0.4 + overlap * 0.12), "Task-title keyword overlap"
    return 0.0, ""


async def detect_inactivity(
    session: AsyncSession, workspace_id: str, days: int = 3
) -> list[Task]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    tasks = (
        (
            await session.execute(
                select(Task).where(
                    Task.workspace_id == workspace_id,
                    Task.last_activity_at < cutoff,
                    Task.state.in_(["open", "in_progress"]),
                )
            )
        )
        .scalars()
        .all()
    )
    for task in tasks:
        task.execution_score = max(0, task.execution_score - 8)
    await session.commit()
    return tasks
