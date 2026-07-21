# Monitoring and Accountability Agent

Celery Beat invokes monitor.organizations each morning. It queues one task job per
open task. Each task job gathers optional signals independently from GitHub activity
matches, Jira/Linear issue status mappings, calendar capacity, and internal status
history. A failure or missing configuration in one connector is ignored for that run
and does not stop any other connector.

The policy gives verified completion priority over blockers, blockers over overdue
work, then progress, then inactivity. It writes task status history and adjusts the
execution score. Overdue work produces a reminder; blocked or inactive work produces
a nudge. Reminder rows are the complete immutable delivery history and include body
hashes, context, channel, status, and send time.

Accountability messages use the configured OpenAI or Cerebras provider with structured
output and a deterministic fallback. The prompt includes the task, deadline, reason,
blockers, tone, and three previous messages. This prevents repeated messages and
supports Friendly, Reminder, Firm, Escalation Warning, Manager Escalation, and Founder
Escalation levels.

User.email is the authoritative delivery address, supplied during Clerk onboarding.
Slack, GitHub, calendar, and other OAuth identities are enrichment/matching records;
GitHub collaborator email is neither reliable nor appropriate as the source of record.
