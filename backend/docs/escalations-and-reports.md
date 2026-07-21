# Escalations, reports, and analytics

EscalationRule is workspace data, not application logic. A rule has JSON conditions
and an action, allowing operators to configure no-progress, missed-deadline, score,
or state thresholds without a deployment. Default examples are provided in
services/escalation_rules.py but must be seeded deliberately by the workspace.

Friday reporting aggregates execution data per workspace, persists a WeeklyReport and
confidence-scored Insight rows, renders an HTML chart/PDF, and stores the resulting
PDF path through the report storage boundary. In production, replace the local report
directory with object storage and save a signed object URL.
