import { api } from "@/lib/api";

/**
 * Thin client for the CloseLoop backend's kgmemory proxy
 * (`/workspaces/{id}/kgmemory/*`). Every call requires the workspace to have
 * connected the Knowledge Graph Memory integration; otherwise the backend
 * returns 409 and these helpers throw.
 */

export type KgPersonSummary = {
  name: string;
  role: string;
  title: string | null;
  skill_count: number;
  commitment_count: number;
  completed_count: number;
  missed_count: number;
  reliability_score: number;
  availability_hours_per_week: number | null;
  is_available: boolean;
};

export type KgPerson = {
  name: string;
  role: string;
  title: string | null;
  skills: string[];
  languages: string[];
  is_technical: boolean;
  experience_years: number | null;
  availability_hours_per_week: number | null;
  timezone: string | null;
  interests: string[];
  career_goals: string | null;
  resume_summary: string | null;
  facts: Record<string, unknown>[];
  reliability: Record<string, unknown>;
  contributions: Record<string, unknown>;
};

export type KgFact = {
  fact_id: string;
  subject: string;
  predicate: string;
  value: string;
  fact_kind: string;
  topics: string[];
  entities: string[];
  project: string | null;
  task: string | null;
  sentiment: string;
  temporal_status: string;
  valid_from: string | null;
  speaker: string | null;
  due_date: string | null;
};

export type KgSearchResponse = {
  query: string;
  prompt_context: string;
  facts: KgFact[];
  associations: Record<string, Record<string, unknown>>;
  intent: Record<string, unknown>;
  project_states: Record<string, unknown>[];
  person_states: Record<string, unknown>[];
  elapsed_ms: number;
};

export type KgDecision = {
  query: string;
  audience: string;
  response_text: string;
  reasoning: string;
  suggested_actions: Record<string, unknown>[];
  risk_level: "low" | "medium" | "high";
  confidence: number;
  context_facts: Record<string, unknown>[];
  project_states: Record<string, unknown>[];
  person_states: Record<string, unknown>[];
  elapsed_ms: number;
};

export type KgAlert = {
  alert_id: string;
  alert_type: string;
  subject: string;
  project: string | null;
  person: string | null;
  severity: string;
  message: string;
  evidence_fact_id: string | null;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
};

export type KgAction = {
  action_id: string;
  action: string;
  target: string;
  message: string;
  urgency: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export type KgProject = {
  name: string;
  description: string | null;
  status: string;
  deadline: string | null;
  task_count: number;
  open_task_count: number;
  member_count: number;
};

export type KgTask = {
  task_id: string;
  title: string | null;
  project: string;
  status: string;
  required_skills: string[];
  estimated_days: number | null;
  deadline: string | null;
  assignee: string | null;
};

export type KgReportStatus = {
  report_id: string;
  status: string;
  report: Record<string, unknown> | null;
  error: string | null;
};

export type KgIngestStatus = {
  request_id: string;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
};

function base(workspaceId: string) {
  return `/workspaces/${workspaceId}/kgmemory`;
}

export async function kgStatus(workspaceId: string) {
  return api<{ connected: boolean }>(`${base(workspaceId)}/status`);
}

// memory / ingest
export async function kgIngest(workspaceId: string, message: {
  message: string;
  speaker: string;
  speaker_role?: string;
  channel?: string;
  project?: string;
  timestamp?: string;
}) {
  return api<{ request_id: string; status: string }>(
    `${base(workspaceId)}/memory/ingest`,
    { method: "POST", body: JSON.stringify(message) },
  );
}

export async function kgIngestBatch(workspaceId: string, messages: {
  message: string;
  speaker: string;
  speaker_role?: string;
  channel?: string;
  project?: string;
}[]) {
  return api<{ request_id: string; status: string; message_count: number }>(
    `${base(workspaceId)}/memory/ingest/batch`,
    { method: "POST", body: JSON.stringify({ messages }) },
  );
}

export async function kgIngestStatus(workspaceId: string, requestId: string) {
  return api<KgIngestStatus>(`${base(workspaceId)}/memory/ingest/${requestId}`);
}

export async function kgListFacts(workspaceId: string, filters?: {
  subject?: string;
  topic?: string;
  project?: string;
  fact_kind?: string;
  current_only?: boolean;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
  }
  const q = qs.toString();
  return api<KgFact[]>(`${base(workspaceId)}/memory/facts${q ? `?${q}` : ""}`);
}

export async function kgSummarizeMeeting(workspaceId: string, body: {
  transcript: string;
  participants?: string[];
  date?: string;
  project?: string;
}) {
  return api<Record<string, unknown>>(
    `${base(workspaceId)}/memory/meetings/summarize`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// context
export async function kgSearch(workspaceId: string, body: {
  query: string;
  max_facts?: number;
  rerank?: boolean;
}) {
  return api<KgSearchResponse>(`${base(workspaceId)}/context/search`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// people
export async function kgListPeople(workspaceId: string) {
  return api<KgPersonSummary[]>(`${base(workspaceId)}/people`);
}

export async function kgGetPerson(workspaceId: string, name: string) {
  return api<KgPerson>(`${base(workspaceId)}/people/${encodeURIComponent(name)}`);
}

export async function kgPersonContributions(workspaceId: string, name: string) {
  return api<Record<string, unknown>>(
    `${base(workspaceId)}/people/${encodeURIComponent(name)}/contributions`,
  );
}

// projects / tasks
export async function kgListProjects(workspaceId: string) {
  return api<KgProject[]>(`${base(workspaceId)}/projects`);
}

export async function kgListTasks(workspaceId: string, project?: string) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return api<KgTask[]>(`${base(workspaceId)}/projects/tasks${qs}`);
}

export async function kgCreateProject(workspaceId: string, body: {
  name: string;
  description?: string;
  status?: string;
  deadline?: string;
}) {
  return api<KgProject>(`${base(workspaceId)}/projects`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function kgCreateTask(workspaceId: string, body: {
  title: string;
  description?: string;
  project: string;
  required_skills?: string[];
  estimated_days?: number;
  deadline?: string;
}) {
  return api<KgTask>(`${base(workspaceId)}/projects/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function kgAssignTask(workspaceId: string, taskId: string, person: string) {
  return api<KgTask>(
    `${base(workspaceId)}/projects/tasks/${taskId}/assign?person=${encodeURIComponent(person)}`,
    { method: "POST" },
  );
}

export async function kgAssignmentRecommendations(workspaceId: string, taskId: string) {
  return api<{ task: KgTask; recommendations: Record<string, unknown>[] }>(
    `${base(workspaceId)}/projects/tasks/${taskId}/recommendations`,
  );
}

export async function kgAutoAssignTask(workspaceId: string, taskId: string) {
  return api<KgTask>(
    `${base(workspaceId)}/projects/tasks/${taskId}/auto-assign`,
    { method: "POST" },
  );
}

// PM brain
export async function kgDecide(workspaceId: string, body: {
  query: string;
  audience?: string;
  project?: string;
  max_facts?: number;
  rerank?: boolean;
}) {
  return api<KgDecision>(`${base(workspaceId)}/pm/decide`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function kgCheckInAuto(workspaceId: string) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/pm/check-in/auto`, {
    method: "POST",
  });
}

export async function kgCheckIn(workspaceId: string, person: string) {
  return api<Record<string, unknown>>(
    `${base(workspaceId)}/pm/check-in?person=${encodeURIComponent(person)}`,
    { method: "POST" },
  );
}

export async function kgFounderDigest(workspaceId: string, audience = "founder_non_technical") {
  return api<Record<string, unknown>>(`${base(workspaceId)}/pm/founder-digest`, {
    method: "POST",
    body: JSON.stringify({ audience }),
  });
}

export async function kgReviewWork(workspaceId: string, body: {
  engineer: string;
  claim: string;
  project?: string;
}) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/pm/review-work`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function kgListDecisions(workspaceId: string, withOutcomeOnly = false) {
  return api<Record<string, unknown>[]>(
    `${base(workspaceId)}/pm/decisions?with_outcome_only=${withOutcomeOnly}`,
  );
}

// PM chat history (persisted per workspace + user)
export type KgChatMessage = {
  id: string;
  role: "user" | "pm";
  text: string;
  actions?: ExecutableAction[] | null;
  created_at?: string | null;
};

export type ExecutableAction = {
  action: string;
  target: string;
  message: string;
  urgency: string;
  status?: "pending" | "running" | "done" | "error";
  result?: string;
};

export async function kgListChat(workspaceId: string) {
  return api<KgChatMessage[]>(`${base(workspaceId)}/pm/chat`);
}

export async function kgCreateChat(
  workspaceId: string,
  body: { role: "user" | "pm"; text: string; actions?: ExecutableAction[] | null },
) {
  return api<KgChatMessage>(`${base(workspaceId)}/pm/chat`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function kgUpdateChatActions(
  workspaceId: string,
  messageId: string,
  actions: ExecutableAction[],
) {
  return api<KgChatMessage>(`${base(workspaceId)}/pm/chat/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ actions }),
  });
}

export async function kgClearChat(workspaceId: string) {
  return api<{ cleared: number }>(`${base(workspaceId)}/pm/chat`, {
    method: "DELETE",
  });
}

export async function kgDecisionAccuracy(workspaceId: string) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/pm/decisions/accuracy`);
}

// monitor / actions
export async function kgListAlerts(workspaceId: string, status = "open") {
  return api<KgAlert[]>(
    `${base(workspaceId)}/monitor/alerts?alert_status=${status}`,
  );
}

export async function kgMonitorScan(workspaceId: string) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/monitor/scan`, {
    method: "POST",
  });
}

export async function kgAckAlert(workspaceId: string, alertId: string) {
  return api<Record<string, unknown>>(
    `${base(workspaceId)}/monitor/alerts/${alertId}/ack`,
    { method: "POST" },
  );
}

export async function kgListActions(workspaceId: string, status = "pending") {
  return api<KgAction[]>(`${base(workspaceId)}/actions?action_status=${status}`);
}

export async function kgCompleteAction(workspaceId: string, actionId: string) {
  return api<Record<string, unknown>>(
    `${base(workspaceId)}/actions/${actionId}/complete`,
    { method: "POST" },
  );
}

// reports
export async function kgRequestReport(workspaceId: string, body: {
  report_type?: string;
  language?: string;
  project?: string;
}) {
  return api<{ report_id: string; status: string }>(
    `${base(workspaceId)}/reports`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function kgReportStatus(workspaceId: string, reportId: string) {
  return api<KgReportStatus>(`${base(workspaceId)}/reports/${reportId}`);
}

// planning
export async function kgPrioritize(workspaceId: string, project?: string) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return api<Record<string, unknown>>(`${base(workspaceId)}/planning/prioritize${qs}`);
}

export async function kgDependencies(workspaceId: string, project?: string) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return api<Record<string, unknown>>(`${base(workspaceId)}/planning/dependencies${qs}`);
}

export async function kgEstimationAccuracy(workspaceId: string, person?: string) {
  const qs = person ? `?person=${encodeURIComponent(person)}` : "";
  return api<Record<string, unknown>>(`${base(workspaceId)}/planning/estimation-accuracy${qs}`);
}

export async function kgScopeCreep(workspaceId: string, project: string) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/planning/scope-creep`, {
    method: "POST",
    body: JSON.stringify({ project }),
  });
}

// sprints
export async function kgListSprints(workspaceId: string, project?: string) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return api<Record<string, unknown>[]>(`${base(workspaceId)}/sprints${qs}`);
}

export async function kgRoadmap(workspaceId: string, project?: string) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return api<Record<string, unknown>>(`${base(workspaceId)}/sprints/roadmap${qs}`);
}

export async function kgCapacity(workspaceId: string, project?: string, weeks = 2) {
  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  qs.set("weeks", String(weeks));
  return api<Record<string, unknown>>(`${base(workspaceId)}/sprints/capacity?${qs}`);
}

// stakeholders / budget
export async function kgStakeholderUpdate(workspaceId: string, body: {
  stakeholder_type: string;
  project?: string;
}) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/stakeholders/update`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function kgBudgetStatus(workspaceId: string, project?: string) {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return api<Record<string, unknown>>(`${base(workspaceId)}/stakeholders/budget${qs}`);
}

// team
export async function kgPerformanceFeedback(workspaceId: string, engineer: string) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/team/performance-feedback`, {
    method: "POST",
    body: JSON.stringify({ engineer }),
  });
}

export async function kgTeamMorale(workspaceId: string) {
  return api<Record<string, unknown>>(`${base(workspaceId)}/team/morale`, {
    method: "POST",
  });
}

// onboarding
export type KgOnboardingStatus = {
  person: string;
  started: boolean;
  step: string;
  completed: boolean;
  skills_known: boolean;
  availability_known: boolean;
  preferences_known: boolean;
  fact_count: number;
};

export async function kgOnboardingStatus(workspaceId: string, name: string) {
  return api<KgOnboardingStatus>(
    `${base(workspaceId)}/onboarding/status?name=${encodeURIComponent(name)}`,
  );
}

export async function kgStartOnboarding(workspaceId: string, name: string, role = "engineer") {
  return api<{ message: string; step: string; person: string }>(
    `${base(workspaceId)}/onboarding/start`,
    { method: "POST", body: JSON.stringify({ name, role }) },
  );
}

export async function kgContinueOnboarding(workspaceId: string, name: string, message: string, step: string) {
  return api<{ message: string; step: string; person: string }>(
    `${base(workspaceId)}/onboarding/continue`,
    { method: "POST", body: JSON.stringify({ name, message, current_step: step }) },
  );
}

// automated PM
export async function kgAutoOnboard(workspaceId: string) {
  return api<{ results: Record<string, unknown>[]; count: number }>(
    `${base(workspaceId)}/pm/auto-onboard`,
    { method: "POST" },
  );
}

export async function kgAutoCheckIn(workspaceId: string) {
  return api<{ results: Record<string, unknown>[]; count: number }>(
    `${base(workspaceId)}/pm/auto-check-in`,
    { method: "POST" },
  );
}

// jira integration
export type JiraIssue = {
  id: string;
  key: string;
  summary: string;
  status: string;
  status_category: string;
  priority: string;
  assignee: string;
  assignee_email: string | null;
  created: string;
  updated: string;
};

export async function listJiraIssues(integrationId: string) {
  return api<{ issues: JiraIssue[]; project_key: string }>(
    `/integrations/jira/${integrationId}/issues`,
  );
}

export async function createJiraIssue(
  integrationId: string,
  summary: string,
  description: string,
) {
  const qs = `?summary=${encodeURIComponent(summary)}&description=${encodeURIComponent(description)}`;
  return api<{ issue: Record<string, unknown> }>(
    `/integrations/jira/${integrationId}/issues${qs}`,
    { method: "POST" },
  );
}

// integrations list (to find jira integration id)
export type Integration = {
  id: string;
  provider: string;
  state: string;
  config: Record<string, unknown>;
};

export async function listIntegrations(workspaceId: string) {
  return api<Integration[]>(`/workspaces/${workspaceId}/integrations`);
}
