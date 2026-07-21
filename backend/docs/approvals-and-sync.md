# Task approvals and issue sync

Tasks at or above TASK_AUTO_APPROVE_CONFIDENCE are materialized automatically.
Lower-confidence extractions are TaskCandidate records and remain pending. Slack
messages use Block Kit buttons for approve, edit, and reject; callbacks validate the
raw Slack signature and resolve the Slack user through ExternalIdentity.

Approving materializes one internal Task and its approved dependency edges. Rejected
candidates never produce tasks. Jira and Linear mappings are unique per internal task
and integration. The hourly Celery Beat job creates new remote issues, updates mapped
issues, reads their current status, refreshes access tokens before expiry, and retries
transient task failures.
