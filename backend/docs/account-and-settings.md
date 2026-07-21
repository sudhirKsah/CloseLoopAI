# Account, profile, and settings APIs

Clerk owns credential flows and verification emails. Configure its email/password
strategies and templates for sign-up, password reset, and email-change verification.
The frontend uses Clerk's sign-up, sign-in, sign-out, and email-change flows; it then
calls the authenticated CloseLoop API to bootstrap or synchronize local profile data.

CloseLoop backend endpoints:

- GET /api/v1/auth/me
- POST /api/v1/auth/bootstrap
- PATCH /api/v1/auth/profile
- POST /api/v1/auth/email/sync (only after Clerk verification)
- POST /api/v1/auth/logout
- GET/PATCH /api/v1/settings/workspaces/{workspace_id}
- DELETE /api/v1/integrations/{integration_id}

Report emails are operational emails sent by CloseLoop SMTP to enabled owner/admin
accounts. Security emails are authentication emails sent by Clerk.
