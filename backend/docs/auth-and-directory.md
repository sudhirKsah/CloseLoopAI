# Authentication, access, and employee directory

CloseLoop uses Clerk only for authentication. Login and signup occur in Clerk-hosted
or frontend Clerk components; the backend validates Clerk JWTs using the issuer/JWKS
and bootstraps a matching local User on the first authenticated request.

User records can represent two different things:

1. Dashboard accounts have clerk_id and is_login_enabled=true. Only workspace owner
   and admin memberships should receive dashboard access.
2. Directory people have no Clerk identity and is_login_enabled=false. They can own
   tasks and receive delivery messages but cannot sign in, view reports, or browse
   colleagues' information.

The Slack directory sync is an optional administrator action. It imports members only
when the workspace granted users:read.email, creates disabled directory records, and
links Slack identities. Calendar attendees can be used for matching suggestions, not
unconsented account creation.
