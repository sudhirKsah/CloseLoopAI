# CloseLoop

Execution intelligence for the work that happens after meetings. CloseLoop
sends a notetaker bot to your calls, and once the meeting ends it turns the
transcript into tracked, owned, and chased work — Jira/Linear tickets, calendar
holds, Slack follow-ups, and weekly execution reports — with a human approval
gate for anything the AI isn't confident about.

## What it does (the loop)

```
 Meeting ends ─▶ Recall bot uploads the full transcript
      │
      ▼
 AI extraction (decisions, tasks, owners, deadlines, confidence)
      │
      ├─ confidence ≥ threshold ─▶ task auto-created
      └─ confidence <  threshold ─▶ Slack approval card (approve / edit / reject)
      │
      ▼
 Tasks assigned to real people (Team Directory) ─▶ Jira / Linear tickets (with assignee)
      │
      ▼
 Continuous monitoring: GitHub commits/PRs, issue-tracker status, calendar load
      │
      ├─ no progress ─▶ escalating reminders (friendly → firm)
      └─ still stuck ─▶ escalate to manager, then founder
      │
      ▼
 Weekly execution report (PDF + email) with metrics and insights
```

## How a normal user works with CloseLoop

1. **Sign in** to the dashboard (Clerk). Your first login bootstraps an
   organization + a "Main" workspace and installs the default escalation ladder.
2. **Add your team (Team Directory).** This is required for assignment and
   notifications to work — CloseLoop maps a name said in a meeting (e.g. "Dave")
   to a real person and their Slack/Jira/GitHub accounts.
   - Add members manually, **import a CSV/Excel roster**
     (`POST /api/v1/workspaces/{id}/members/import`, template at
     `.../members/template`), or **auto-sync from Slack**
     (`POST /api/v1/workspaces/{id}/members/sync/slack`).
3. **Connect integrations** (OAuth): Slack (approvals + DMs), Jira/Linear
   (tickets), GitHub (progress tracking), Google/Microsoft Calendar, Notion.
4. **Send the bot to a meeting**: `POST /api/v1/recall/bots` with the meeting
   URL. The bot joins and records.
5. **After the meeting ends**, CloseLoop automatically fetches the complete
   transcript, extracts decisions/tasks, auto-creates high-confidence tasks, and
   posts the rest to your Slack approval channel.
6. **Review the approval queue** in the dashboard (or from Slack). Approved
   items become tasks and sync to Jira/Linear, assigned to the right person.
7. **Let it run.** CloseLoop watches GitHub/issue-tracker activity, nudges
   owners when work stalls, escalates to managers/founders per your rules, and
   emails a weekly execution report.

## Run the dashboard
```bash
cd frontend
npm install
npm run dev
```

## Run services
```bash
cd backend
pip install -r requirements.txt

# One-time / on schema changes: apply DB migrations (see "Database" below)
alembic upgrade head

uvicorn app.main:app --reload
celery -A app.celery_app.celery worker --loglevel=info
celery -A app.celery_app.celery beat --loglevel=info
```

Redis (broker) and Postgres must be reachable via `REDIS_URL` and
`DATABASE_URL` in `backend/.env`. `CREDENTIAL_ENCRYPTION_KEY` must be a valid
Fernet key (generate with
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).

### Background schedule (Celery Beat)

| Job | Schedule | What it does |
| --- | --- | --- |
| `monitor.organizations` | daily 03:00 UTC | Reassess every open task from all connected signals |
| `integrations.sync_all` | hourly (:10) | Push tasks → Jira/Linear and pull their status |
| `github.sync_all` | hourly (:25) | **Fallback** reconciliation poll for GitHub (see webhooks below) |
| `reports.generate_weekly` | Fri 04:00 UTC | Build + email the weekly execution report |

Monitoring connectors are registered through `CONNECTORS` (GitHub, issue
tracker, calendar, status history), so every signal shares one normalized
monitoring policy.

### Meeting ingestion (post-meeting, not real-time)

The Recall bot is configured for an **async transcript** — CloseLoop does not
process partial/streaming transcript data. When the bot emits `bot.done` /
`recording.done` / `transcript.done`, `meetings.finalize` downloads the complete
transcript, stores it as ordered chunks, and enqueues extraction. If Recall is
still transcribing, the finalize job retries with backoff until it's ready.

### GitHub tracking (webhook-first, polling fallback)

GitHub progress is ingested primarily via a **webhook**: selecting a repo
auto-registers a `push` / `pull_request` / `issues` hook pointing at
`POST /api/v1/webhooks/github` (requires `GITHUB_WEBHOOK_SECRET` and a
publicly reachable `PUBLIC_API_BASE_URL`; skipped gracefully in local dev).
Inbound events are signature-verified (`X-Hub-Signature-256`) and processed by
the `github.process_webhook` task. The hourly `github.sync_all` poll is only a
reconciliation fallback for anything a webhook misses (downtime, repos where
the hook couldn't be registered). Both paths share one ingestion function, so
matching, real event timestamps, and author→member attribution are identical.

### Team directory & identity resolution

A directory member is a `User` (with `is_login_enabled=False` for people who
aren't dashboard logins) linked to a workspace via `WorkspaceMember`, plus
`ExternalIdentity` rows for their Slack / Jira / GitHub / Linear accounts.
`app/services/directory.py` resolves a transcript name to a member (by display
name → alias → email) and is used by extraction (owner assignment), task sync
(Jira/Linear assignee), GitHub activity attribution (`actor_id`), and reminders.

### Database & migrations

Schema is managed with Alembic (`migrations/`). Apply with `alembic upgrade
head`; create new migrations after model changes with
`alembic revision --autogenerate -m "<change>"`. `init_db.py` (drop + create) is
for local resets only — do not run it against a real database.

## kgmemory (knowledge-graph memory layer)

CloseLoop can optionally connect to [`memory-pinchfast`](../../memory-pinchfast)
(`kgmemory`), a separate FastAPI microservice that ingests conversation facts
into a per-organization knowledge graph and computes engineer reliability /
project health over time. When connected:

- Every extracted meeting (decisions + transcript) is pushed to kgmemory
  (`kgmemory.sync_meeting` Celery task) so commitments and decisions persist
  across meetings instead of being scoped to a single extraction.
- Weekly reports enrich the deterministic `AnalyticsEngine` insights with
  kgmemory's cross-meeting reliability scores (`WeeklyReportService._kgmemory_insights`).

### Run kgmemory locally

```bash
cd ../memory-pinchfast
cp .env.template .env   # set LLM_API_KEY/EMBEDDING_API_KEY (OpenAI-compatible)
docker compose up -d    # postgres:5433, redis:6381, falkordb:6380, api:8001
```

Create an org + API key (see `memory-pinchfast/README.md`), then connect a
CloseLoop workspace to it:

```bash
curl -X POST http://localhost:8000/api/v1/integrations/kgmemory/connect \
  -H "Authorization: Bearer <clerk-jwt>" -H "Content-Type: application/json" \
  -d '{"workspace_id": "<workspace-uuid>", "api_key": "pfm_..."}'
```

Set `KGMEMORY_BASE_URL` in `backend/.env` if kgmemory isn't running on the
default `http://localhost:8001/v1`.
