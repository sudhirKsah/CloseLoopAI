# CloseLoop

Execution intelligence for the work that happens after meetings.

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
uvicorn app.main:app --reload
celery -A app.celery_app.celery worker --loglevel=info
celery -A app.celery_app.celery beat --loglevel=info
```

The Celery Beat schedule runs monitoring daily at 03:00 UTC (08:30 IST) and
weekly reports each Friday at 04:00 UTC. Connector implementations are
registered through `CONNECTORS`, allowing GitHub, Jira, Linear, and calendar
signals to share one normalized monitoring policy.
