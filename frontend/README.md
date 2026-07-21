# CloseLoop frontend

Copy .env.example to .env.local and configure the FastAPI base URL and Clerk publishable key.

The authenticated API client sends the Clerk session JWT from
localStorage key closeloop_token. The in-app Clerk session bridge refreshes this
token and calls the backend bootstrap endpoint after sign-in. The active workspace
is selected from the authenticated user's memberships, not an environment variable.

Dashboard routes use the following FastAPI endpoints:

- GET workspaces/{workspace_id}/overview, tasks, meetings, people, integrations, insights
- GET/POST execution/workspaces/{workspace_id}/reports
- GET/PATCH settings/workspaces/{workspace_id}
- GET integrations/{provider}/connect and DELETE integrations/{integration_id}
