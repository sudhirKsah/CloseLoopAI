# CloseLoop backend

## Structure

- `app/models/` — relational domain schema; importing `app.models` registers all metadata for Alembic.
- `app/services/` — vendor clients, webhook verification, and idempotent event projection.
- `app/api/v1/` — HTTP boundary and request validation.
- `app/db/` — async SQLAlchemy engine/session and metadata conventions.

## Relationship map

`Organization 1—N Workspace`; a `Workspace N—N User` through `WorkspaceMember`.
`Workspace 1—N Meeting/Task/Integration/WeeklyReport/Insight`. A meeting owns its
participants and one transcript; a transcript owns ordered chunks, each optionally
linked to a canonical speaker. Decisions originate from meetings; tasks may link to
a decision, owner, comments, status history, dependencies, reminders, and escalations.
Integrations own OAuth credentials and provider records (repositories, GitHub activity,
and calendar events). Audit logs are organization scoped and notifications user scoped.

## Recall setup

Set `RECALL_API_KEY`, `RECALL_REGION`, `PUBLIC_API_BASE_URL`, and
`RECALL_WORKSPACE_VERIFICATION_SECRET`. Configure the dashboard webhook at
`/api/v1/recall/webhooks/dashboard`; bot creation configures the per-bot real-time
webhook at `/api/v1/recall/webhooks/realtime`.

Requests are verified against the raw body before parsing or persistence. The webhook
id is uniquely indexed, then a Celery worker performs transcript persistence after a
fast 202 acknowledgment. Replayed events cannot create duplicate chunks because both
webhook ids and provider utterance ids are unique.
