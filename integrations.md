# Integration Setup Guide

This guide walks through obtaining OAuth credentials for each integration
CloseLoop supports. Set the values in `backend/.env` and restart the backend.

## Table of Contents

- [GitHub](#github)
- [Slack](#slack)
- [Google Calendar](#google-calendar)
- [Microsoft Calendar (Microsoft 365)](#microsoft-calendar-microsoft-365)
- [Jira (Atlassian)](#jira-atlassian)
- [Linear](#linear)
- [Notion](#notion)
- [Recall.ai (Meeting Bots)](#recallai-meeting-bots)
- [Knowledge Graph Memory (kgmemory)](#knowledge-graph-memory-kgmemory)
- [Clerk (Authentication)](#clerk-authentication)

---

## GitHub

GitHub integration allows CloseLoop to register webhooks on your repositories
and sync commit/PR/issue activity to tasks.

### Steps

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (https://github.com/settings/developers)
2. Fill in:
   - **Application name**: `CloseLoop`
   - **Homepage URL**: `http://localhost:3000` (or your production URL)
   - **Authorization callback URL**: `http://localhost:8000/api/v1/integrations/github/callback`
3. Click **Register application**
4. Copy the **Client ID** → `GITHUB_CLIENT_ID`
5. Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`
6. Create a **webhook secret** (any random string) → `GITHUB_WEBHOOK_SECRET`
   This is used to verify incoming GitHub webhook signatures.

### Required Scopes

The OAuth flow requests these scopes automatically:
- `repo` — Full control of private repositories (for webhooks + activity reading)
- `user:email` — Read user email for member mapping

### .env Variables

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_SECRET=your_random_webhook_secret
```

### Webhook Setup

Webhooks are **auto-registered** when you select a repository in the
Integrations page. The webhook URL is:

```
http://your-backend-url/api/v1/webhooks/github
```

For local development, use a tunnel like ngrok:
```bash
ngrok http 8000
# Then set PUBLIC_API_BASE_URL to the ngrok URL
```

---

## Slack

Slack integration enables directory sync (import team members) and delivery
of reminders/escalations to Slack channels.

### Steps

1. Go to **https://api.slack.com/apps → Create New App**
2. Choose **From scratch**
3. Fill in:
   - **App Name**: `CloseLoop`
   - **Workspace**: Select your workspace
4. Go to **OAuth & Permissions** and add these Bot Token Scopes:
   - `users:read` — List workspace members
   - `users:read.email` — Read member emails for directory sync
   - `team:read` — Read team info
   - `chat:write` — Send reminders and escalations to channels
   - `channels:read` — List public channels
5. Go to **OAuth & Permissions → Redirect URLs** and add:
   ```
   http://localhost:8000/api/v1/integrations/slack/callback
   ```
6. Go to **Basic Information** and copy:
   - **Client ID** → `SLACK_CLIENT_ID`
   - **Client Secret** → `SLACK_CLIENT_SECRET`
   - **Signing Secret** → `SLACK_SIGNING_SECRET`

### .env Variables

```
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_SIGNING_SECRET=your_signing_secret
```

---

## Google Calendar

Google Calendar integration allows CloseLoop to detect upcoming meetings
and auto-schedule Recall bots.

### Steps

1. Go to **Google Cloud Console** (https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**:
   - Go to **APIs & Services → Library**
   - Search for "Google Calendar API" and click **Enable**
4. Create OAuth credentials:
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs:
     ```
     http://localhost:8000/api/v1/integrations/google_calendar/callback
     ```
5. Copy:
   - **Client ID** → `GOOGLE_CLIENT_ID`
   - **Client Secret** → `GOOGLE_CLIENT_SECRET`
6. Configure OAuth consent screen:
   - Go to **APIs & Services → OAuth consent screen**
   - Add scope: `https://www.googleapis.com/auth/calendar.readonly`
   - Add your email as a test user

### .env Variables

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

---

## Microsoft Calendar (Microsoft 365)

Microsoft Calendar integration allows CloseLoop to detect upcoming Teams
meetings and auto-schedule Recall bots.

### Steps

1. Go to **Azure Portal → App Registrations** (https://portal.azure.com)
2. Click **New registration**
3. Fill in:
   - **Name**: `CloseLoop`
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Web →
     ```
     http://localhost:8000/api/v1/integrations/microsoft_calendar/callback
     ```
4. After creation, go to **Certificates & secrets → New client secret**
5. Copy:
   - **Application (client) ID** → `MICROSOFT_CLIENT_ID`
   - **Client secret value** → `MICROSOFT_CLIENT_SECRET`
6. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:
   - `Calendars.Read` — Read user calendars
   - `User.Read` — Read user profile
   - `offline_access` — Required for refresh tokens

### .env Variables

```
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
```

---

## Jira (Atlassian)

Jira integration allows CloseLoop to create and sync issues from extracted
tasks. After connecting, you must select a project to map tasks to.

### Steps

1. Go to **Atlassian Developer Console** (https://developer.atlassian.com)
2. Click **Create → OAuth 2.0 integration**
3. Fill in:
   - **App name**: `CloseLoop`
   - **Logo**: Optional
   - **Authorization callback URL**:
     ```
     http://localhost:8000/api/v1/integrations/jira/callback
     ```
4. Go to **Permissions → Add API scopes**:
   - `read:jira-work` — Read projects and issues
   - `write:jira-work` — Create and update issues
   - `offline_access` — Get refresh tokens
5. Copy:
   - **Client ID** → `JIRA_CLIENT_ID`
   - **Secret** → `JIRA_CLIENT_SECRET`

### Post-Connection

After OAuth completes, CloseLoop automatically fetches your Atlassian cloud ID.
You then need to **select a project** in the Integrations page — this sets the
`project_key` in the integration config, which is used when creating new issues.

### .env Variables

```
JIRA_CLIENT_ID=your_client_id
JIRA_CLIENT_SECRET=your_client_secret
```

---

## Linear

Linear integration allows CloseLoop to create and sync issues from extracted
tasks. After connecting, you must select a team to map tasks to.

### Steps

1. Go to **Linear → Settings → API → OAuth 2.0** (https://linear.app/settings/api)
2. Click **Create new OAuth application**
3. Fill in:
   - **Application name**: `CloseLoop`
   - **Redirect URL**:
     ```
     http://localhost:8000/api/v1/integrations/linear/callback
     ```
4. Select scopes:
   - `read` — Read teams, projects, and issues
   - `write` — Create and update issues
5. Copy:
   - **Client ID** → `LINEAR_CLIENT_ID`
   - **Client Secret** → `LINEAR_CLIENT_SECRET`

### Post-Connection

After OAuth completes, you need to **select a team** in the Integrations page.
This sets the `team_id` in the integration config, which is required when
creating new Linear issues (issues are created at the team level, not project
level in Linear).

### .env Variables

```
LINEAR_CLIENT_ID=your_client_id
LINEAR_CLIENT_SECRET=your_client_secret
```

---

## Notion

Notion integration allows CloseLoop to read documentation and link it to
tasks (future feature).

### Steps

1. Go to **Notion Integrations** (https://www.notion.so/my-integrations)
2. Click **Create new integration**
3. Fill in:
   - **Name**: `CloseLoop`
   - **Type**: Internal integration
4. Copy:
   - **OAuth Client ID** → `NOTION_CLIENT_ID`
   - **OAuth Client Secret** → `NOTION_CLIENT_SECRET`
5. Set redirect URI:
   ```
   http://localhost:8000/api/v1/integrations/notion/callback
   ```

### .env Variables

```
NOTION_CLIENT_ID=your_client_id
NOTION_CLIENT_SECRET=your_client_secret
```

---

## Recall.ai (Meeting Bots)

Recall.ai provides the meeting bots that join Google Meet, Zoom, Microsoft
Teams, and Slack Huddles to record audio and generate transcripts.

### Steps

1. Go to **Recall.ai Dashboard** (https://recall.ai)
2. Sign up / log in
3. Go to **API Keys** and copy your **API key**
4. Select your region (e.g., `us-east-1`)
5. Set up webhook endpoints (for real-time meeting events):
   - Go to **Webhooks**
   - Add dashboard webhook URL:
     ```
     http://your-backend-url/api/v1/recall/webhooks/dashboard
     ```
   - Optional: Add realtime webhook URL:
     ```
     http://your-backend-url/api/v1/recall/webhooks/realtime
     ```
6. Generate a **workspace verification secret** (for webhook signature verification)

### .env Variables

```
RECALL_API_KEY=your_api_key
RECALL_REGION=us-east-1
RECALL_WORKSPACE_VERIFICATION_SECRET=your_verification_secret
RECALL_SVIX_WEBHOOK_SECRET=your_svix_secret
```

### How It Works

1. User adds a meeting URL in the frontend
2. Frontend calls `POST /api/v1/recall/bots` with the meeting URL
3. Backend creates a Recall bot via the Recall.ai API
4. Bot joins the meeting at the scheduled time
5. After the meeting, Recall.ai sends a webhook (`bot.done` / `transcript.done`)
6. Backend downloads the full transcript and enqueues AI extraction
7. Extracted decisions/tasks appear in the Approvals queue

---

## Knowledge Graph Memory (kgmemory)

kgmemory is an optional integration that adds engineer reliability scoring
and meeting memory. Unlike other integrations, it uses a static API key
instead of OAuth.

### Steps

1. Start the kgmemory service:
   ```bash
   cd memory-pinchfast
   docker compose up -d
   ```
2. Create an organization in kgmemory
3. Generate an API key via the kgmemory API:
   ```bash
   curl -X POST http://localhost:8001/v1/orgs/{org_id}/api-keys \
     -H "Content-Type: application/json" \
     -d '{"name": "closeloop"}'
   ```
4. In the CloseLoop frontend, go to **Integrations → Knowledge Graph Memory → Connect**
5. Enter the API key and (optionally) the base URL

### .env Variables (backend)

```
KGMEMORY_BASE_URL=http://localhost:8001/v1
KGMEMORY_REQUEST_TIMEOUT=20.0
```

---

## Clerk (Authentication)

Clerk handles user authentication (sign up, sign in, email verification).
The frontend uses `@clerk/nextjs` and the backend verifies Clerk JWTs.

### Steps

1. Go to **Clerk Dashboard** (https://dashboard.clerk.com)
2. Create a new application
3. Go to **API Keys** and copy:
   - **Secret key** → `CLERK_SECRET_KEY`
4. Go to **JWT Templates → New Template → Backend API**
5. Copy the:
   - **Issuer URL** → `CLERK_ISSUER` (e.g., `https://set-rodent-93.clerk.accounts.dev`)
   - **JWKS URL** → `CLERK_JWKS_URL` (e.g., `https://set-rodent-93.clerk.accounts.dev/.well-known/jwks.json`)
   - **Audience** → `CLERK_AUDIENCE` (if set in the template)

### Frontend .env

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### Backend .env

```
CLERK_ISSUER=https://your-app.clerk.accounts.dev
CLERK_JWKS_URL=https://your-app.clerk.accounts.dev/.well-known/jwks.json
CLERK_AUDIENCE=
CLERK_SECRET_KEY=sk_test_...
```

---

## Environment Variable Reference (backend/.env)

```env
# Database
DATABASE_URL=postgresql+psycopg://closeloop:closeloop@localhost:5432/closeloop
REDIS_URL=redis://localhost:6379/0

# Frontend (for OAuth redirects)
FRONTEND_URL=http://localhost:3000

# Auth (Clerk)
CLERK_ISSUER=
CLERK_JWKS_URL=
CLERK_AUDIENCE=
CLERK_SECRET_KEY=

# Meeting Bots (Recall.ai)
RECALL_API_KEY=
RECALL_REGION=us-east-1
RECALL_WORKSPACE_VERIFICATION_SECRET=
RECALL_SVIX_WEBHOOK_SECRET=

# AI
AI_PROVIDER=openai
OPENAI_API_KEY=
MEETING_EXTRACTION_MODEL=gpt-4o
CEREBRAS_API_KEY=
CEREBRAS_MODEL=

# GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=

# Slack
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Microsoft Calendar
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Jira
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=

# Linear
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=

# Notion
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# kgmemory (optional)
KGMEMORY_BASE_URL=http://localhost:8001/v1
KGMEMORY_REQUEST_TIMEOUT=20.0

# Security
CREDENTIAL_ENCRYPTION_KEY=generate_a_32_byte_key

# Reports
REPORTS_DIR=/tmp/closeloop-reports
```

---

## Local Development with Webhooks

For integrations that use webhooks (GitHub, Recall.ai, Slack interactive),
your backend needs to be reachable from the internet. Use a tunnel:

### Using ngrok

```bash
# Terminal 1 — start the backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2 — expose it
ngrok http 8000
```

Then update your `.env`:
```
PUBLIC_API_BASE_URL=https://your-ngrok-url.ngrok.io
```

And update OAuth redirect URIs in each provider's dashboard to use the
ngrok URL instead of `localhost:8000`.

### Using Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:8000
```
