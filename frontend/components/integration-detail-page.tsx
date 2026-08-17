"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  FolderTree,
  Github,
  Key,
  Link2,
  RefreshCw,
  Slack,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useWorkspace } from "@/components/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { GithubRepoResponse, Integration, SyncResult } from "@/lib/types";

const PROVIDER_LABELS: Record<string, string> = {
  google_calendar: "Google Calendar",
  microsoft_calendar: "Microsoft Calendar",
  kgmemory: "Knowledge Graph Memory",
};

function label(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider.replaceAll("_", " ");
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "github") return <Github size={20} />;
  if (provider === "slack") return <Slack size={20} />;
  if (provider.includes("calendar")) return <Calendar size={20} />;
  if (provider === "kgmemory") return <Zap size={20} />;
  return <Link2 size={20} />;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[.06] py-3 last:border-0">
      <span className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-right text-sm text-zinc-200">{value}</span>
    </div>
  );
}

export function IntegrationDetailPage({ integrationId }: { integrationId: string }) {
  const { workspaceId, me } = useWorkspace();
  const toast = useToast();
  const q = useApi<Integration[]>(
    workspaceId ? `/workspaces/${workspaceId}/integrations` : "",
  );
  const [busy, setBusy] = useState<string>();
  const [showDisconnect, setShowDisconnect] = useState(false);

  const integration = q.data?.find((i) => i.id === integrationId);
  const provider = integration?.provider ?? "";
  const connected = integration?.state === "connected";

  const disconnect = async () => {
    if (!integration) return;
    setShowDisconnect(false);
    setBusy("disconnect");
    try {
      await api(`/integrations/${integration.id}`, { method: "DELETE" });
      toast(`${label(provider)} disconnected`, "success");
      window.location.assign("/integrations");
    } catch {
      toast("Failed to disconnect", "error");
    } finally {
      setBusy(undefined);
    }
  };

  const syncCalendar = async () => {
    if (!integration || !me) return;
    setBusy("calendar-sync");
    try {
      const result = await api<SyncResult>(
        `/integrations/calendar/${integration.id}/sync?user_id=${me.id}`,
        { method: "POST" },
      );
      toast(`Calendar synced: ${result.synced ?? 0} events`, "success");
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Calendar sync failed", "error");
    } finally {
      setBusy(undefined);
    }
  };

  const syncSlackDirectory = async () => {
    if (!integration) return;
    setBusy("slack-sync");
    try {
      const result = await api<SyncResult>(
        `/integrations/slack/${integration.id}/directory-sync`,
        { method: "POST" },
      );
      toast(`Slack directory synced: ${result.synced_people ?? 0} people`, "success");
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Slack sync failed", "error");
    } finally {
      setBusy(undefined);
    }
  };

  // GitHub repo selection
  const [repoOpen, setRepoOpen] = useState(false);
  const [repos, setRepos] = useState<GithubRepoResponse["repositories"]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());

  const loadRepos = async () => {
    if (!integration) return;
    setRepoOpen(true);
    setLoadingRepos(true);
    try {
      const result = await api<GithubRepoResponse>(
        `/integrations/github/${integration.id}/repositories`,
      );
      setRepos(result.repositories);
      setSelectedRepos(
        new Set(result.repositories.filter((r) => r.selected).map((r) => r.full_name)),
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load repos", "error");
      setRepoOpen(false);
    } finally {
      setLoadingRepos(false);
    }
  };

  const toggleRepo = async (fullName: string) => {
    if (!integration) return;
    const [owner, name] = fullName.split("/");
    const isSelected = selectedRepos.has(fullName);
    setBusy(`repo-${fullName}`);
    try {
      if (isSelected) {
        setSelectedRepos((prev) => {
          const next = new Set(prev);
          next.delete(fullName);
          return next;
        });
      } else {
        await api(
          `/integrations/github/${integration.id}/repositories/${owner}/${name}`,
          { method: "POST" },
        );
        setSelectedRepos((prev) => new Set(prev).add(fullName));
        toast(`Repository ${fullName} selected — webhook registered`, "success");
        await q.reload();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to select repo", "error");
    } finally {
      setBusy(undefined);
    }
  };

  const syncRepo = async (fullName: string) => {
    if (!integration) return;
    const [owner, name] = fullName.split("/");
    setBusy(`sync-${fullName}`);
    try {
      const result = await api<{ repo_id: string }>(
        `/integrations/github/${integration.id}/repositories/${owner}/${name}`,
        { method: "POST" },
      );
      const syncResult = await api<SyncResult>(
        `/integrations/github/repos/${result.repo_id}/sync`,
        { method: "POST" },
      );
      toast(`Synced ${fullName}: ${syncResult.inserted ?? 0} new activities`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Repo sync failed", "error");
    } finally {
      setBusy(undefined);
    }
  };

  // Jira project selection
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraProjects, setJiraProjects] = useState<{ key: string; name: string }[]>([]);
  const [loadingJira, setLoadingJira] = useState(false);
  const [selectedJiraKey, setSelectedJiraKey] = useState<string>();

  const loadJiraProjects = async () => {
    if (!integration) return;
    setJiraOpen(true);
    setLoadingJira(true);
    try {
      const result = await api<{ projects: { key: string; name: string }[]; selected?: string }>(
        `/integrations/jira/${integration.id}/projects`,
      );
      setJiraProjects(result.projects);
      setSelectedJiraKey(result.selected);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load Jira projects", "error");
      setJiraOpen(false);
    } finally {
      setLoadingJira(false);
    }
  };

  const selectJiraProject = async (projectKey: string) => {
    if (!integration) return;
    setBusy(`jira-${projectKey}`);
    try {
      await api(`/integrations/jira/${integration.id}/projects/${projectKey}`, {
        method: "POST",
      });
      setSelectedJiraKey(projectKey);
      toast(`Jira project ${projectKey} selected`, "success");
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to select project", "error");
    } finally {
      setBusy(undefined);
    }
  };

  // Linear team selection
  const [linearOpen, setLinearOpen] = useState(false);
  const [linearTeams, setLinearTeams] = useState<{ id: string; name: string; key: string }[]>([]);
  const [loadingLinear, setLoadingLinear] = useState(false);
  const [selectedLinearTeam, setSelectedLinearTeam] = useState<string>();

  const loadLinearTeams = async () => {
    if (!integration) return;
    setLinearOpen(true);
    setLoadingLinear(true);
    try {
      const result = await api<{ teams: { id: string; name: string; key: string }[]; selected?: string }>(
        `/integrations/linear/${integration.id}/teams`,
      );
      setLinearTeams(result.teams);
      setSelectedLinearTeam(result.selected);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load Linear teams", "error");
      setLinearOpen(false);
    } finally {
      setLoadingLinear(false);
    }
  };

  const selectLinearTeam = async (teamId: string) => {
    if (!integration) return;
    setBusy(`linear-${teamId}`);
    try {
      await api(`/integrations/linear/${integration.id}/teams/${teamId}`, {
        method: "POST",
      });
      setSelectedLinearTeam(teamId);
      toast("Linear team selected", "success");
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to select team", "error");
    } finally {
      setBusy(undefined);
    }
  };

  if (q.loading) {
    return (
      <main className="p-5 lg:p-8">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-8 w-64" />
        <Skeleton className="mt-6 h-48 rounded-2xl" />
      </main>
    );
  }

  if (q.error || !integration) {
    return (
      <main className="p-5 lg:p-8">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white"
        >
          <ArrowLeft size={15} />
          Integrations
        </Link>
        <Card className="mt-6 border-amber-300/20 p-8 text-sm text-amber-100">
          <p className="font-medium">Unable to load integration</p>
          <p className="mt-2 text-zinc-500">{q.error ?? "Integration not found."}</p>
        </Card>
      </main>
    );
  }

  const d = integration.details;

  return (
    <main className="p-5 lg:p-8">
      <Link
        href="/integrations"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white"
      >
        <ArrowLeft size={15} />
        Integrations
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/[.07]">
            <ProviderIcon provider={provider} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {label(provider)}
              </h1>
              {connected && (
                <Badge variant="success">
                  <Check size={11} /> Connected
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {connected
                ? integration.last_synced_at
                  ? `Last synced ${new Date(integration.last_synced_at).toLocaleString()}`
                  : "Connected and ready"
                : "Not connected"}
            </p>
          </div>
        </div>
        {connected && (
          <Button
            variant="ghost"
            disabled={busy === "disconnect"}
            onClick={() => setShowDisconnect(true)}
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        )}
      </div>

      {!connected && (
        <Card className="mt-6 p-8 text-sm text-zinc-400">
          This integration is not connected. Go back to the integrations page to connect it.
        </Card>
      )}

      {connected && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Connection details */}
          <Card className="p-5">
            <p className="font-medium">Connection</p>
            <div className="mt-3">
              <DetailRow label="Provider" value={label(provider)} />
              <DetailRow label="Status" value={<Badge variant="success">Connected</Badge>} />
              <DetailRow
                label="Last synced"
                value={
                  integration.last_synced_at
                    ? new Date(integration.last_synced_at).toLocaleString()
                    : "Never"
                }
              />
              <DetailRow label="Integration ID" value={<code className="text-xs">{integration.id}</code>} />
            </div>
          </Card>

          {/* Provider-specific details */}
          <Card className="p-5">
            <p className="font-medium">Details</p>
            <div className="mt-3">
              {provider === "github" && (
                <GithubDetails
                  details={d}
                  busy={busy}
                  onSyncRepo={syncRepo}
                  onSelectRepos={loadRepos}
                />
              )}
              {provider === "jira" && (
                <JiraDetails
                  details={d}
                  busy={busy}
                  onSelectProject={loadJiraProjects}
                />
              )}
              {provider === "linear" && (
                <LinearDetails
                  details={d}
                  busy={busy}
                  onSelectTeam={loadLinearTeams}
                />
              )}
              {provider === "slack" && (
                <SlackDetails
                  details={d}
                  busy={busy}
                  onSyncDirectory={syncSlackDirectory}
                />
              )}
              {provider.includes("calendar") && (
                <CalendarDetails
                  details={d}
                  busy={busy}
                  onSyncCalendar={syncCalendar}
                />
              )}
              {provider === "kgmemory" && <KgMemoryDetails details={d} />}
              {provider === "notion" && (
                <DetailRow label="Account" value={d?.account ?? "—"} />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* GitHub repo selection dialog */}
      <Dialog
        open={repoOpen}
        onClose={() => setRepoOpen(false)}
        title="Select repositories"
        description="Webhooks are auto-registered for real-time activity sync."
        maxWidth="max-w-2xl"
      >
        {loadingRepos ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No repositories found. Make sure your GitHub token has repo access.
          </p>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {repos.map((repo) => {
              const isSelected = selectedRepos.has(repo.full_name);
              return (
                <div
                  key={repo.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
                >
                  <Github size={16} className="shrink-0 text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{repo.full_name}</p>
                    <p className="text-xs text-zinc-500">
                      {repo.private ? "Private" : "Public"} · {repo.default_branch}
                    </p>
                  </div>
                  {isSelected && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `sync-${repo.full_name}`}
                      onClick={() => syncRepo(repo.full_name)}
                    >
                      <RefreshCw size={12} />
                      {busy === `sync-${repo.full_name}` ? "…" : "Sync"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={isSelected ? "secondary" : "primary"}
                    disabled={busy === `repo-${repo.full_name}`}
                    onClick={() => toggleRepo(repo.full_name)}
                  >
                    {isSelected ? (
                      <>
                        <Check size={13} /> Selected
                      </>
                    ) : (
                      "Select"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>

      {/* Jira project selection dialog */}
      <Dialog
        open={jiraOpen}
        onClose={() => setJiraOpen(false)}
        title="Select Jira project"
        description="New issues will be created in this project when tasks are synced."
        maxWidth="max-w-lg"
      >
        {loadingJira ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : jiraProjects.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No projects found in your Jira workspace.
          </p>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {jiraProjects.map((project) => {
              const isSelected = selectedJiraKey === project.key;
              return (
                <div
                  key={project.key}
                  className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="text-xs text-zinc-500">{project.key}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isSelected ? "secondary" : "primary"}
                    disabled={busy === `jira-${project.key}`}
                    onClick={() => selectJiraProject(project.key)}
                  >
                    {isSelected ? (
                      <>
                        <Check size={13} /> Selected
                      </>
                    ) : (
                      "Select"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>

      {/* Linear team selection dialog */}
      <Dialog
        open={linearOpen}
        onClose={() => setLinearOpen(false)}
        title="Select Linear team"
        description="New issues will be created in this team when tasks are synced."
        maxWidth="max-w-lg"
      >
        {loadingLinear ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : linearTeams.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No teams found in your Linear workspace.
          </p>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {linearTeams.map((team) => {
              const isSelected = selectedLinearTeam === team.id;
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{team.name}</p>
                    <p className="text-xs text-zinc-500">{team.key}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isSelected ? "secondary" : "primary"}
                    disabled={busy === `linear-${team.id}`}
                    onClick={() => selectLinearTeam(team.id)}
                  >
                    {isSelected ? (
                      <>
                        <Check size={13} /> Selected
                      </>
                    ) : (
                      "Select"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>

      {/* Disconnect confirmation dialog */}
      <Dialog
        open={showDisconnect}
        onClose={() => setShowDisconnect(false)}
        title={`Disconnect ${label(provider)}?`}
        description="This will remove the integration and all stored credentials. You can reconnect later."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => setShowDisconnect(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy === "disconnect"}
            onClick={() => void disconnect()}
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

function GithubDetails({
  details,
  busy,
  onSyncRepo,
  onSelectRepos,
}: {
  details: Integration["details"];
  busy?: string;
  onSyncRepo: (fullName: string) => void;
  onSelectRepos: () => void;
}) {
  const repos = details?.repos ?? [];
  return (
    <>
      <DetailRow
        label="Selected repos"
        value={repos.length ? `${repos.length} repositor${repos.length === 1 ? "y" : "ies"}` : "None"}
      />
      {repos.length > 0 ? (
        <div className="mt-3 space-y-2">
          {repos.map((r) => (
            <div
              key={r.full_name}
              className="flex items-center gap-2 rounded-lg border border-white/[.06] bg-white/[.02] p-2.5"
            >
              <Github size={14} className="shrink-0 text-zinc-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{r.full_name}</p>
                {r.default_branch && (
                  <p className="text-xs text-zinc-500">default: {r.default_branch}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === `sync-${r.full_name}`}
                onClick={() => onSyncRepo(r.full_name)}
              >
                <RefreshCw size={12} />
                {busy === `sync-${r.full_name}` ? "…" : "Sync"}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-200/80">
          No repositories selected yet. Click below to choose which repositories to track.
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onSelectRepos}>
          <Github size={13} /> {repos.length ? "Manage repos" : "Select repos"}
        </Button>
      </div>
    </>
  );
}

function JiraDetails({
  details,
  busy,
  onSelectProject,
}: {
  details: Integration["details"];
  busy?: string;
  onSelectProject: () => void;
}) {
  return (
    <>
      <DetailRow label="Site" value={details?.site ?? "—"} />
      <DetailRow
        label="Project"
        value={
          details?.project_key ? (
            <Badge variant="info">{details.project_key}</Badge>
          ) : (
            <span className="text-amber-300/80">Not selected</span>
          )
        }
      />
      {!details?.project_key && (
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-200/80">
          No project selected. Task sync requires a target Jira project.
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onSelectProject} disabled={!!busy}>
          <FolderTree size={13} /> {details?.project_key ? "Change project" : "Select project"}
        </Button>
      </div>
    </>
  );
}

function LinearDetails({
  details,
  busy,
  onSelectTeam,
}: {
  details: Integration["details"];
  busy?: string;
  onSelectTeam: () => void;
}) {
  return (
    <>
      <DetailRow
        label="Team"
        value={
          details?.team_id ? (
            <span className="text-white">{details.team_name || details.team_id}</span>
          ) : (
            <span className="text-amber-300/80">Not selected</span>
          )
        }
      />
      {!details?.team_id && (
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-200/80">
          No team selected. Task sync requires a target Linear team.
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onSelectTeam} disabled={!!busy}>
          <FolderTree size={13} /> {details?.team_id ? "Change team" : "Select team"}
        </Button>
      </div>
    </>
  );
}

function SlackDetails({
  details,
  busy,
  onSyncDirectory,
}: {
  details: Integration["details"];
  busy?: string;
  onSyncDirectory: () => void;
}) {
  return (
    <>
      <DetailRow label="Workspace" value={details?.team_name ?? "—"} />
      {details?.team_id && <DetailRow label="Team ID" value={<code className="text-xs">{details.team_id}</code>} />}
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onSyncDirectory} disabled={busy === "slack-sync"}>
          <RefreshCw size={13} />
          {busy === "slack-sync" ? "Syncing…" : "Sync directory"}
        </Button>
      </div>
    </>
  );
}

function CalendarDetails({
  details,
  busy,
  onSyncCalendar,
}: {
  details: Integration["details"];
  busy?: string;
  onSyncCalendar: () => void;
}) {
  return (
    <>
      <DetailRow label="Account" value={details?.account ?? "—"} />
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onSyncCalendar} disabled={busy === "calendar-sync"}>
          <RefreshCw size={13} />
          {busy === "calendar-sync" ? "Syncing…" : "Sync calendar"}
        </Button>
      </div>
    </>
  );
}

function KgMemoryDetails({ details }: { details: Integration["details"] }) {
  return (
    <>
      <DetailRow
        label="Base URL"
        value={details?.base_url ? <code className="text-xs">{details.base_url}</code> : "Default"}
      />
      <DetailRow
        label="API key"
        value={
          <span className="inline-flex items-center gap-1.5 text-zinc-500">
            <Key size={12} /> stored securely
          </span>
        }
      />
    </>
  );
}
