# PostgreSQL schema

Every primary key is a UUID. Tenant-owned data cascades on deletion; people links use
SET NULL so historical meeting and audit evidence is retained after deprovisioning.

| Relationship | Cardinality | Purpose |
| --- | --- | --- |
| Organization → Workspace | 1:N | Isolates teams, clients, or business units. |
| Workspace ↔ User | N:N via WorkspaceMember | Membership stores the workspace authorization role. |
| Workspace → Meeting | 1:N | Meetings belong to one execution context. |
| Meeting → Participant | 1:N | Attendance snapshots optionally resolve to a CloseLoop user. |
| Meeting → Transcript → TranscriptChunk | 1:1 → 1:N | One canonical transcript holds ordered incrementally stored utterances. |
| Meeting → Speaker | 1:N | Normalizes vendor speaker labels for chunks. |
| Meeting → Decision → Task | 1:N → 0:N | Tasks retain meeting provenance but can also be manual. |
| Task → Dependency/Comment/History/Reminder/Escalation | 1:N | Records graph edges, context, state evidence, nudges, and escalation. |
| Workspace → Integration → OAuthCredential | 1:N → 1:1 | Credentials and provider configuration are workspace isolated. |
| Integration → GitHubRepo/CalendarEvent | 1:N | Synchronized provider records remain connection-scoped. |
| GitHubRepo → GitHubActivity | 1:N | Provider activity can be attributed to people and task monitoring. |
| Workspace → WeeklyReport → Insight | 1:N → 0:N | Period reports own explainable insights. |
| Organization → AuditLog; User → Notification | 1:N | Organization audit trail and personal inbox. |

Compound indexes target open tasks by workspace/owner/due date, meetings by
workspace/status/time, ordered transcript chunks, unprocessed webhooks, pending
reminders, and activity by actor/time. Unique provider ids, webhook ids, utterance
ids, calendar ids, and GitHub ids make at-least-once deliveries safe.
