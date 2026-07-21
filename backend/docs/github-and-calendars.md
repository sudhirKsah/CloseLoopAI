# GitHub and calendar integrations

Repository monitoring is opt-in. Teams explicitly select repositories after OAuth,
which prevents activity from an unrelated repository being attributed to a task.
README inspection is suitable only as a future discovery suggestion; it must not add
repositories or task mappings without user confirmation.

GitHub activity is stored as commits, pull requests, merged pull requests, and closed
issues. Matching requires selected-repository context plus task-title overlap and saves
an explicit confidence/reason. Matches increase the task execution score; no activity
for three days reduces it.

Google and Microsoft calendar connections are isolated integrations. Calendar sync
stores only connected users' events, computes busy hours, out-of-office/vacation and
meeting-overload signals, and returns a conservative recommended due-date window.
No calendar failure affects GitHub, Slack, Jira, Linear, or task extraction.
