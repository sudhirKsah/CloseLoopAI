# CloseLoop AI

Execution intelligence for the work that happens after meetings. CloseLoop
sends a notetaker bot to your calls, turns transcripts into tracked work,
and includes an AI Project Manager that talks to your team on Slack.

## Three services

| Service | Port | Directory | What it does |
|---------|------|-----------|--------------|
| Frontend | 3000 | `frontend/` | Next.js dashboard + AI PM interface |
| Backend | 8000 | `backend/` | FastAPI API, Slack events, integrations |
| Memory | 8001 | `memory-closeloop/` | Knowledge graph, AI PM brain, onboarding |

## Prerequisites

- Node.js 18+ and npm
- Python 3.12+
- Docker Desktop (for memory service + local databases)
- PostgreSQL (local Docker container or cloud)
- Redis (local Docker container or cloud)

## Quick start (all three services)

### 1. Memory service (Docker)

```bash
cd memory-closeloop
cp .env.template .env   # set LLM_API_KEY, EMBEDDING_API_KEY
docker compose up -d
```

This starts:
- FalkorDB (graph) on port 6380
- Redis (queue) on port 6381
- PostgreSQL on port 5433
- API on port 8001
- Worker (background jobs)

Verify: `curl http://localhost:8001/docs` should return the API docs.

### 2. Backend (Python + uvicorn)

Start PostgreSQL and Redis (if using local Docker):

```bash
docker run -d --name closeloop-postgres -e POSTGRES_USER=closeloop -e POSTGRES_PASSWORD=closeloop -e POSTGRES_DB=closeloop -p 5432:5432 postgres:16-alpine
docker run -d --name closeloop-redis -p 6379:6379 redis:7-alpine
```

Configure `backend/.env` (see `backend/.env.example` for all keys):

```
DATABASE_URL=postgresql+psycopg://closeloop:closeloop@127.0.0.1:5432/closeloop
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET_KEY=your-secret-key
CREDENTIAL_ENCRYPTION_KEY=your-fernet-key
SLACK_SIGNING_SECRET=your-slack-signing-secret
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
```

Install and run:

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head          # apply database migrations
python run_dev.py             # starts uvicorn on port 8000
```

Verify: `curl http://localhost:8000/health` should return `{"status":"ok"}`.

### 3. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Verify: open `http://localhost:3000` in your browser.

## Connecting the AI PM (kgmemory)

1. Create an org and API key in the memory service (see `memory-closeloop/README.md`).
2. Connect it to your CloseLoop workspace:

```bash
curl -X POST http://localhost:8000/api/v1/integrations/kgmemory/connect \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "<workspace-uuid>", "api_key": "pfm_..."}'
```

3. Go to **Integrations** in the dashboard to connect Slack.
4. Go to **PM Memory** to onboard your team and start using the AI PM.

## AI PM features

- **Chat with PM** — Ask about your team, progress, or what to do next
- **Team** — View rich member profiles built from Slack conversations,
  onboard new members, send check-ins
- **Actions** — See alerts and pending PM actions, scan for issues

The PM automatically:
- Onboards all Slack workspace members via DM
- Conducts check-ins and work reviews on Slack
- Builds rich profiles from every conversation
- Detects issues and generates alerts
- Runs on a background scheduler

## Connecting integrations

From the dashboard, go to **Integrations** to connect:
- **Slack** — Team directory sync, PM DMs, approval cards
- **GitHub** — Commit/PR tracking, task matching
- **Jira** — Ticket creation and status sync
- **Linear** — Ticket creation and status sync
- **Google Calendar / Microsoft Calendar** — Meeting load tracking
- **Notion** — Notes sync

## Database migrations

```bash
cd backend
alembic upgrade head                    # apply all migrations
alembic revision --autogenerate -m "description"  # create new migration
```

## Project structure

```
CloseLoopAI/
├── frontend/           # Next.js dashboard
├── backend/            # FastAPI API server
│   ├── app/
│   │   ├── api/v1/     # API routes
│   │   ├── services/   # Business logic
│   │   ├── models/     # SQLAlchemy models
│   │   └── main.py     # App entry point
│   ├── migrations/     # Alembic migrations
│   └── run_dev.py      # Windows-compatible dev launcher
├── memory-closeloop/   # Knowledge graph memory service
│   ├── kgmemory/
│   │   ├── onboarding/ # Engineer onboarding flow
│   │   ├── projects/   # Project intake flow
│   │   ├── state/      # Person/project state inference
│   │   ├── llm/        # LLM prompts and client
│   │   └── graph/      # FalkorDB graph client
│   └── docker-compose.yml
└── README.md
```

## Troubleshooting

**Backend won't start (database connection error)**
- Make sure PostgreSQL is running: `docker ps | findstr postgres`
- Check `DATABASE_URL` in `backend/.env`

**Memory service won't start**
- Make sure Docker Desktop is running
- Check `memory-closeloop/.env` has valid `LLM_API_KEY`

**Frontend can't connect to backend**
- Verify backend is running: `curl http://localhost:8000/health`
- Check `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (defaults to `http://localhost:8000/api/v1`)

**PowerShell blocks npm/npx**
- Use `npm.cmd` instead of `npm`, or run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

**Slack events not received**
- Backend must be reachable from the internet (use ngrok for local dev)
- Set `PUBLIC_API_BASE_URL` in `backend/.env` to your ngrok URL
- Configure the Slack Events URL in your Slack app settings
