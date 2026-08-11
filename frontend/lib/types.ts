export type Task = {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  state: string;
  due_at: string | null;
  execution_score: number;
  confidence: number | null;
  last_activity_at: string | null;
};
export type Overview = {
  execution_score: number;
  task_count: number;
  on_track: number;
  at_risk: number;
  meetings: number;
  tasks: Task[];
};
export type Meeting = {
  id: string;
  title: string;
  provider: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
};
export type Person = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  avatar_url: string | null;
  dashboard_access: boolean;
};
export type IntegrationDetails = {
  repos?: { full_name: string; default_branch: string | null }[];
  repo_count?: number;
  project_key?: string | null;
  site?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  account?: string | null;
  base_url?: string | null;
};
export type Integration = {
  id: string;
  provider: string;
  state: string;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  details?: IntegrationDetails;
};
export type Insight = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  explanation: string;
  created_at: string;
};
export type Report = {
  id: string;
  period_start: string;
  pdf_url: string | null;
  data: {
    execution_score: number;
    organization_summary: { completed: number; missed: number; tasks: number };
  };
};

export type Member = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  role: string;
  skills: string[];
  aliases: string[];
  dashboard_access: boolean;
  external_ids: Record<string, string>;
};

export type GithubRepository = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  selected: boolean;
};

export type GithubRepoResponse = {
  repositories: GithubRepository[];
};

export type KgMemoryConnectResponse = {
  connected: boolean;
  integration_id: string;
};

export type SyncResult = {
  synced?: number;
  synced_people?: number;
  inserted?: number;
  imported?: number;
  skipped?: number;
  errors?: string[];
};

export type Profile = {
  id: string;
  display_name: string;
  timezone: string | null;
  notification_preferences: Record<string, unknown>;
};
