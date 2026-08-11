# CloseLoop — Complete Usage Guide

CloseLoop is an AI-powered meeting execution platform. It sends a bot to your meetings, transcribes them, extracts decisions/tasks/risks/questions with AI, syncs tasks to Jira or Linear, tracks GitHub progress, monitors execution with escalation rules, and generates weekly reports — closing the loop between meetings and actual execution.

This guide walks you through one complete end-to-end flow.

---

## Table of Contents

1. [Prerequisites & Setup](#1-prerequisites--setup)
2. [Step 1 — Create an Account & Workspace](#step-1--create-an-account--workspace)
3. [Step 2 — Add Your Team (People)](#step-2--add-your-team-people)
4. [Step 3 — Connect Integrations](#step-3--connect-integrations)
5. [Step 4 — Configure Integrations](#step-4--configure-integrations)
6. [Step 5 — Set Up Escalation Rules](#step-5--set-up-escalation-rules)
7. [Step 6 — Add a Meeting](#step-6--add-a-meeting)
8. [Step 7 — Review the Transcript](#step-7--review-the-transcript)
9. [Step 8 — Review AI Extraction Results](#step-8--review-ai-extraction-results)
10. [Step 9 — Approve Task Candidates](#step-9--approve-task-candidates)
11. [Step 10 — Tasks Sync to Jira/Linear](#step-10--tasks-sync-to-jiralinear)
12. [Step 11 — GitHub Progress Tracking](#step-11--github-progress-tracking)
13. [Step 12 — Monitor Execution & Escalations](#step-12--monitor-execution--escalations)
14. [Step 13 — View Analytics](#step-13--view-analytics)
15. [Step 14 — Generate Reports](#step-14--generate-reports)
16. [Complete Flow Diagram](#complete-flow-diagram)
17. [Troubleshooting](#troubleshooting)

---

## Prerequisites & Setup

Before using CloseLoop, you need the following running:

### Backend services

```bash
# PostgreSQL
sudo systemctl start postgresql

# Redis (for Celery)
redis-server --daemonize yes

# Backend API
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Celery worker (processes webhooks, sync, reports)
celery -A app.celery_app.celery worker --loglevel=info

# Celery beat (scheduled tasks: hourly sync, weekly reports, daily monitoring)
celery -A app.celery_app.celery beat --loglevel=info
```

### Frontend

```bash
cd frontend
npm run dev
```

### ngrok (for Recall and OAuth webhooks)

```bash
ngrok http 8000
```

Update `PUBLIC_API_BASE_URL` in `backend/.env` to the ngrok URL. Update provider OAuth redirect URLs to match — see `integrations.md` for details.

### Required external accounts

| Service | What you need | Where to get it |
|---------|--------------|-----------------|
| **Recall.ai** | API key + webhook secret | https://recall.ai dashboard |
| **AI provider** | OpenAI or Cerebras API key | https://platform.openai.com or https://cerebras.ai |
| **GitHub** | OAuth app (client ID + secret) | https://github.com/settings/developers |
| **Slack** | Slack app (client ID + secret) | https://api.slack.com/apps |
| **Jira** | Atlassian OAuth 2.0 app | https://developer.atlassian.com |
| **Linear** | Linear OAuth 2.0 app | https://linear.app/developers |
| **Google Calendar** | Google Cloud OAuth app | https://console.cloud.google.com |
| **kgmemory** (optional) | API key | kgmemory dashboard |

See `integrations.md` for detailed setup of each provider.

### Key environment variables

```env
# Core
DATABASE_URL=postgresql+psycopg://closeloop:closeloop@localhost:5432/closeloop
REDIS_URL=redis://localhost:6379
CREDENTIAL_ENCRYPTION_KEY=<fernet key>
JWT_SECRET_KEY=<your secret>

# Recall.ai
RECALL_API_KEY=<your key>
PUBLIC_API_BASE_URL=https://<your-ngrok-url>.ngrok-free.app

# AI extraction
AI_PROVIDER=cerebras          # or "openai"
CEREBRAS_API_KEY=<your key>
# OPENAI_API_KEY=<your key>   # if using openai

# Frontend
FRONTEND_URL=http://localhost:3000
```

Full variable reference is in `integrations.md` and `backend/app/config.py`.

---

## Step 1 — Create an Account & Workspace

1. Go to `http://localhost:3000/signup`.
2. Enter your email, display name, and password.
3. A workspace is created automatically with you as the owner.
4. You are redirected to the dashboard.

> The first user in a workspace is the **owner**. Owners can add members, connect integrations, configure escalation rules, and generate reports.

---

## Step 2 — Add Your Team (People)

Before meetings can assign tasks to people, those people need to exist in your workspace directory. CloseLoop uses the directory to map transcript speaker names to team members.

### Option A — Sync from Slack

1. Go to **People** (`/people`).
2. Click **Sync from Slack**.
3. All Slack workspace members are imported with their names, emails, and Slack identities.

### Option B — Import via CSV

1. Click **Download Template** to get the CSV format.
2. Fill in: `name`, `email`, `title`, `department`, `role`, `dashboard_access`.
3. Click **Import CSV** and upload the file.

### Option C — Add manually

1. Click **Add Member**.
2. Fill in name, email, title, department, role (owner/admin/member), and dashboard access.
3. Click **Save**.

> **Why this matters:** When the AI extracts a task with an owner name like "Sarah", CloseLoop matches it to a directory member named Sarah. That member then gets the task assigned, receives Slack reminders, and is mapped to the correct Jira/Linear assignee.

---

## Step 3 — Connect Integrations

Go to **Integrations** (`/integrations`). You will see cards for GitHub, Slack, Google Calendar, Microsoft Calendar, Jira, Linear, Notion, and kgmemory.

### Minimum integrations for the full flow

To complete the end-to-end demo, connect at minimum:

| Integration | Why |
|-------------|-----|
| **Slack** | Directory sync + escalation notifications |
| **GitHub** | Progress tracking (commits/PRs matched to tasks) |
| **Jira** or **Linear** | Task sync (issues created from approved tasks) |
| **Google Calendar** or **Microsoft Calendar** | Optional — syncs meeting events |

### How to connect

1. Click **Connect** on the provider card.
2. You are redirected to the provider's OAuth page.
3. Authorize the app.
4. You are redirected back to `/integrations` with the integration now showing **Connected**.

> **kgmemory** is connected differently — click **Connect**, enter your API key (and optional base URL), and submit. It adds engineer reliability scoring to analytics and reports.

---

## Step 4 — Configure Integrations

After connecting, click **Manage** or **View details** on any connected integration to open its detail page (`/integrations/{id}`).

### GitHub — Select repositories

1. Open the GitHub integration detail page.
2. Click **Select repos**.
3. A dialog lists all your GitHub repositories.
4. Click **Select** on each repo you want to track.
5. A webhook is automatically registered on each selected repo so commits and PRs flow into CloseLoop in real time.

> **What this does:** CloseLoop matches GitHub activity (commit messages, PR titles) to tasks by title/description similarity. When someone commits code related to a task, that activity is linked to the task and improves its execution score.

### Jira — Select a project

1. Open the Jira integration detail page.
2. Click **Select project**.
3. A dialog lists all projects in your Jira workspace.
4. Click **Select** on the target project.
5. The project key (e.g., `PROJ`) is saved.

> **What this does:** When a task is approved, CloseLoop creates a Jira issue in this project. The assignee is mapped from the task owner's Jira account ID (resolved via the directory). Without a selected project, task sync to Jira will not work.

### Linear — Select a team

1. Open the Linear integration detail page.
2. Click **Select team**.
3. A dialog lists all teams in your Linear workspace.
4. Click **Select** on the target team.
5. The team ID is saved.

> **What this does:** Same as Jira — approved tasks become Linear issues in the selected team, with assignee mapped from the directory.

### Slack — Sync directory

1. Open the Slack integration detail page.
2. Click **Sync directory**.
3. All Slack members are imported into your People directory.

### Calendar — Sync events

1. Open the Calendar integration detail page.
2. Click **Sync calendar**.
3. Upcoming calendar events are synced (useful for scheduling meeting captures).

> **Tip:** You can revisit any integration's detail page at any time to see its current configuration, last sync time, and selected resources. Click **Disconnect** to remove the integration.

---

## Step 5 — Set Up Escalation Rules

Escalation rules automatically remind or escalate when tasks stall.

1. Go to **Settings** (`/settings`) → **Escalation rules**.
2. Default rules are pre-seeded:
   - **No progress 3 days** → Slack reminder to owner
   - **No progress 7 days** → Escalation to manager
   - **No progress 14 days** → Escalation to founder
   - **Repeated missed deadlines (3+)** → Manager escalation
3. You can add custom rules:
   - **Rule name** — descriptive label
   - **No progress for (days)** — how many days of inactivity triggers the rule
   - **Action** — Slack reminder, manager escalation, or founder escalation
   - **Priority** — lower number = evaluated first

> Rules run daily via Celery beat. When a rule fires, a reminder or escalation record is created and a Slack message is sent (if Slack is connected).

---

## Step 6 — Add a Meeting

This is where the core flow begins.

1. Go to **Meetings** (`/meetings`).
2. Click **Add meeting** (or the + button).
3. Fill in:
   - **Meeting URL** (required) — the full URL of your meeting (Zoom, Google Meet, Teams, or Slack Huddle)
   - **Title** (optional) — a name for the meeting
   - **Join at** (optional) — when the bot should join (if scheduling ahead)
4. Click **Create**.

### What happens next

1. CloseLoop creates a meeting record with status `JOINING`.
2. A Recall.ai bot is created and joins the meeting at the scheduled time (or immediately if no `join_at`).
3. The bot appears as "CloseLoop Notetaker" in the meeting.
4. The bot records and transcribes the meeting in real time.
5. When the meeting ends, Recall sends webhooks (`bot.done`, `recording.done`, `transcript.done`) to the backend.
6. The backend downloads the transcript, persists it as ordered chunks with speaker info, and triggers AI extraction.

> **Supported platforms:** Google Meet (`meet.google.com`), Zoom (`zoom.us`), Microsoft Teams (`teams.microsoft.com`), Slack Huddle (`slack.com`).
>
> **Important:** The meeting URL must be publicly accessible (not behind a waiting room that requires manual approval, unless the host admits the bot).

### Monitoring bot status

On the Meetings page, each meeting shows its status:
- `JOINING` — bot is connecting
- `JOINED` — bot is in the meeting
- `ENDED` — meeting ended, processing transcript
- `PROCESSING` — transcript being downloaded and extracted
- `DONE` — transcript and extraction complete

---

## Step 7 — Review the Transcript

Once the meeting status shows `ENDED` or `DONE`:

1. Click on the meeting in the Meetings list.
2. You are taken to the meeting detail page (`/meetings/{meetingId}`).
3. Scroll down to see the **Transcript** section.
4. The transcript is displayed as sequential chunks with speaker names and timestamps.

> If the transcript is not visible after the meeting ends, check that:
> - Celery worker is running (processes the webhook)
> - Redis is running (Celery broker)
> - The Recall webhook reached your backend (check ngrok is running and `PUBLIC_API_BASE_URL` is correct)

---

## Step 8 — Review AI Extraction Results

After the transcript is persisted, AI extraction runs automatically (via Celery). On the same meeting detail page you will see:

| Section | What it shows |
|---------|--------------|
| **Meeting summary** | A concise AI-generated summary of the meeting |
| **Decisions** | Each decision with title, rationale, evidence (transcript quotes), and confidence |
| **Tasks and action items** | Extracted tasks with owner, deadline, dependencies, evidence, and confidence |
| **Risks** | Identified risks with severity (low/medium/high) and evidence |
| **Questions** | Open questions with owner and evidence |

> If extraction has not run automatically (e.g., AI provider was misconfigured), you can click **Run extraction** manually on the meeting detail page.

### AI providers

- **Cerebras** (recommended for speed) — set `AI_PROVIDER=cerebras` and `CEREBRAS_API_KEY`
- **OpenAI** — set `AI_PROVIDER=openai` and `OPENAI_API_KEY`

### Confidence threshold

Tasks with confidence >= `TASK_AUTO_APPROVE_CONFIDENCE` (default: 0.85) are auto-created as real tasks. Tasks below the threshold become **task candidates** that need human approval.

---

## Step 9 — Approve Task Candidates

Low-confidence extracted tasks go to the approval queue.

1. Go to **Approvals** (`/approvals`).
2. You will see pending task candidates with:
   - Title and description
   - Suggested owner
   - Suggested deadline
   - Confidence percentage
   - Evidence from the transcript
3. For each candidate:
   - **Approve** — creates a real task and queues it for sync to Jira/Linear
   - **Reject** — discards the candidate
   - **Edit** — modify title/description/owner/deadline before approving

> **Why this matters:** This is the human-in-the-loop checkpoint. It prevents low-quality AI extractions from becoming real tasks in your issue tracker while still automating the high-confidence ones.

---

## Step 10 — Tasks Sync to Jira/Linear

Once a task is approved (or auto-approved with high confidence):

1. The task is created in CloseLoop's task database.
2. The Celery beat job `integrations.sync_all` runs hourly (at :10 UTC).
3. For each connected integration:
   - **Jira** — creates an issue in the selected project, maps the task owner to a Jira assignee via the directory, and stores the issue key mapping.
   - **Linear** — creates an issue in the selected team, maps the assignee similarly.
4. On subsequent syncs, CloseLoop updates the issue (title, description) and pulls the latest status from Jira/Linear.

### Viewing tasks

1. Go to **Tasks** (`/tasks`).
2. Each task shows title, due date, state (on-track/overdue/blocked), and execution score.
3. Click a task to see its detail page (`/tasks/{taskId}`) with:
   - Evidence from the meeting
   - Dependencies on other tasks
   - GitHub activity matches (commits/PRs linked to this task)
   - External references (Jira issue key or Linear identifier)

> **Requirements for sync to work:**
> - Jira: project must be selected (Step 4)
> - Linear: team must be selected (Step 4)
> - Task owner must be mapped to a Jira/Linear user via the directory (Step 2)

---

## Step 11 — GitHub Progress Tracking

GitHub is not for task creation — it's for **progress tracking**. CloseLoop matches GitHub activity to existing tasks.

### How it works

1. You selected repositories in Step 4. Webhooks were registered on each repo.
2. When someone pushes a commit or opens a PR, GitHub sends a webhook to CloseLoop.
3. CloseLoop matches the commit/PR to tasks by comparing titles and descriptions using similarity scoring.
4. Matched activity is linked to the task as a `github_match` with a confidence score and reason.
5. This activity improves the task's execution score (evidence of progress).

### Viewing GitHub matches

1. Go to **Tasks** → click a task.
2. On the task detail page, see **GitHub activity matches** showing:
   - Activity ID
   - Confidence score
   - Reason for the match

### Manual repo sync

If webhooks aren't firing (e.g., during setup), you can manually sync a repo:
1. Go to **Integrations** → GitHub detail page.
2. Click **Sync** on any selected repository.
3. CloseLoop polls recent activity and matches it to tasks.

> There is also a fallback hourly poll via the `github.sync_all` Celery job that catches any missed webhook events.

---

## Step 12 — Monitor Execution & Escalations

### Dashboard

Go to **Dashboard** (`/dashboard`) to see:
- **Execution score** — average across all tasks
- **On-track work** — count of tasks not overdue or blocked
- **Meetings captured** — total meetings recorded
- **At-risk tasks** — count of overdue or blocked tasks
- **Execution radar** — top 8 open tasks sorted by urgency, color-coded by status

### How execution scores work

Each task gets an execution score (0-100) based on:
- Whether it has GitHub activity (progress evidence)
- Whether it's on time, overdue, or blocked
- Whether reminders/escalations have been triggered
- Whether dependencies are resolved

### Escalations

The daily monitoring job (Celery beat) evaluates escalation rules against all tasks:
1. Rules are evaluated in priority order.
2. If a rule's conditions match (e.g., "no progress for 3 days"):
   - **Reminder** — sends a Slack DM to the task owner
   - **Manager escalation** — sends a Slack message to the owner's manager
   - **Founder escalation** — sends a Slack message to the workspace founder
3. Escalation and reminder records are stored for audit.

> **Setting up manager/founder mapping:** Each member can have a `manager_id` set in the directory. The workspace founder is the workspace owner. These are used for escalation targeting.

---

## Step 13 — View Analytics

Go to **Analytics** (`/analytics`) to see AI-generated insights about your team's execution patterns.

### Available insights

| Insight | What it tells you |
|---------|------------------|
| **Consistently finishes early** | People who complete tasks before deadlines |
| **Misses deadlines** | People with overdue tasks |
| **Departments needing attention** | Teams with the most blocked work |
| **Who is overloaded** | People with 5+ active tasks |
| **Meeting-to-execution ratio** | Tasks generated per decision (are meetings productive?) |
| **Execution bottlenecks** | Departments with most blocked work |
| **Most productive weekday** | Best day for task completion |
| **Engineer reliability (kgmemory)** | Reliability scores from kgmemory (if connected) |
| **Engineers needing attention (kgmemory)** | Low-reliability engineers (if connected) |

Each insight shows a confidence score and an explanation.

---

## Step 14 — Generate Reports

### Manual report generation

1. Go to **Reports** (`/reports`).
2. Click **Generate report**.
3. A weekly report is created covering the current period.

### What's in a report

- **Execution score** — overall team execution score
- **Organization summary** — total tasks, completed, missed, meetings
- **Meeting efficiency** — meetings count, decisions count, tasks-per-decision ratio
- **Top performers** — top 5 people by completed tasks
- **Most blocked teams** — departments with most blocked work
- **AI recommendations** — generated suggestions for improvement
- **All insights** from the analytics engine
- **PDF** — rendered with charts and delivered via email to workspace admins

### Automatic reports

The Celery beat job `reports.generate_weekly` runs every Friday at 04:00 UTC and:
1. Generates the report PDF.
2. Stores it in `REPORTS_DIR` (default: `/tmp/closeloop-reports`).
3. Emails it to all workspace owners/admins with login enabled.

> **Email setup:** Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend/.env` for email delivery to work.

---

## Complete Flow Diagram

```
Sign up → Create workspace
    │
    ▼
Add team members (People)
    ├── Sync from Slack
    ├── Import CSV
    └── Add manually
    │
    ▼
Connect integrations (Integrations page)
    ├── Slack (for notifications + directory)
    ├── GitHub (for progress tracking)
    ├── Jira or Linear (for task sync)
    └── Calendar (optional, for events)
    │
    ▼
Configure integrations (Integration detail pages)
    ├── GitHub → Select repositories (registers webhooks)
    ├── Jira → Select project
    ├── Linear → Select team
    └── Slack → Sync directory
    │
    ▼
Set up escalation rules (Settings → Escalations)
    └── Configure reminder/escalation thresholds
    │
    ▼
Add a meeting (Meetings → Add meeting)
    └── Recall bot joins Zoom/Meet/Teams/Slack
    │
    ▼
Bot records → Transcript downloaded (via Celery)
    │
    ▼
AI extraction runs (Cerebras or OpenAI)
    ├── Meeting summary
    ├── Decisions (with evidence + confidence)
    ├── Tasks (with owner, deadline, dependencies)
    ├── Risks (with severity)
    └── Questions (with owner)
    │
    ▼
Task routing
    ├── Confidence ≥ 0.85 → Auto-created as real task
    └── Confidence < 0.85 → Approval queue
                              ├── Approve → Becomes real task
                              └── Reject  → Discarded
    │
    ▼
Task sync (Celery hourly job)
    ├── Jira issue created in selected project
    └── Linear issue created in selected team
    │
    ▼
GitHub progress tracking
    ├── Webhook fires on commit/PR
    ├── Activity matched to task by similarity
    └── Execution score updated
    │
    ▼
Execution monitoring (Celery daily job)
    ├── Escalation rules evaluated
    ├── Slack reminders sent to owners
    └── Escalations sent to managers/founders
    │
    ▼
Analytics (Analytics page)
    └── AI insights on team execution patterns
    │
    ▼
Reports (Reports page / Celery weekly job)
    ├── PDF generated with metrics + insights
    └── Emailed to workspace admins
    │
    ▼
  ╔══════════════════════════════════════╗
  ║       THE LOOP IS CLOSED             ║
  ║  Meeting → Task → Execution → Report ║
  ╚══════════════════════════════════════╝
```

---

## Troubleshooting

### Meeting bot doesn't join

- Check `RECALL_API_KEY` is set correctly.
- Check `PUBLIC_API_BASE_URL` points to your ngrok URL.
- Check the meeting URL is valid and accessible.
- Check Recall dashboard for bot status.

### Transcript doesn't appear

- Check Celery worker is running: `celery -A app.celery_app.celery worker --loglevel=info`
- Check Redis is running: `redis-cli ping` should return `PONG`.
- Check ngrok is running and the URL matches `PUBLIC_API_BASE_URL`.
- Check Recall webhooks are reaching the backend (look for `POST /api/v1/recall/webhooks` in backend logs).

### AI extraction fails

- Check `AI_PROVIDER` is set to `cerebras` or `openai`.
- Check the corresponding API key is set and valid.
- Check `CEREBRAS_API_KEY` or `OPENAI_API_KEY` is not empty.
- You can manually retry extraction on the meeting detail page.

### Tasks not syncing to Jira/Linear

- Check the integration is connected.
- Check a project (Jira) or team (Linear) is selected on the integration detail page.
- Check the task owner exists in the directory and has an external identity mapping (Jira account ID or Linear user ID).
- Check Celery worker and beat are running (the sync job runs hourly).

### GitHub activity not matching tasks

- Check repositories are selected on the GitHub integration detail page.
- Check webhooks are registered (look for webhook delivery in GitHub repo settings).
- Check the commit/PR message is similar to the task title (matching is similarity-based).
- Try manual repo sync from the integration detail page.

### Escalations not firing

- Check Slack is connected.
- Check escalation rules exist (Settings → Escalations).
- Check Celery beat is running (daily monitoring job).
- Check the task owner has a Slack identity in the directory.

### Reports not generating

- Check `REPORTS_DIR` is writable.
- Check WeasyPrint is installed: `pip install weasyprint`.
- For email delivery, check SMTP settings are correct.
- You can manually generate from the Reports page.

### OAuth redirect errors

- The OAuth redirect URI must exactly match what's registered with the provider.
- The backend callback URL is: `{PUBLIC_API_BASE_URL}/api/v1/integrations/{provider}/callback`
- After OAuth completes, the backend redirects to `FRONTEND_URL/integrations`.
- See `integrations.md` for each provider's exact redirect URI.

---

## Quick Start Checklist

Run through this to complete one full flow in under 30 minutes:

- [ ] Backend running (`uvicorn app.main:app --reload`)
- [ ] Celery worker running
- [ ] Celery beat running
- [ ] Redis running
- [ ] ngrok running and `PUBLIC_API_BASE_URL` updated
- [ ] Frontend running (`npm run dev`)
- [ ] Signed up and created a workspace
- [ ] Added at least 2 team members (People page)
- [ ] Connected Slack → Synced directory
- [ ] Connected GitHub → Selected at least 1 repository
- [ ] Connected Jira or Linear → Selected project/team
- [ ] Reviewed escalation rules (Settings → Escalations)
- [ ] Created a meeting with a real meeting URL
- [ ] Held the meeting (bot joined, recorded, transcribed)
- [ ] Reviewed transcript on meeting detail page
- [ ] Reviewed AI extraction (decisions, tasks, risks, questions)
- [ ] Approved/rejected task candidates (Approvals page)
- [ ] Verified tasks appear on Tasks page
- [ ] Verified Jira/Linear issues were created (after hourly sync or next sync cycle)
- [ ] Pushed a commit to a tracked GitHub repo and saw it match a task
- [ ] Checked dashboard for execution score
- [ ] Checked analytics for insights
- [ ] Generated a report

You have now completed the full CloseLoop flow: **Meeting → Transcript → Extraction → Approval → Task Sync → GitHub Tracking → Escalation → Analytics → Report**.
