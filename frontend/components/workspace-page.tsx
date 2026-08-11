"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarClock,
  FileText,
  Lightbulb,
  ListChecks,
  RefreshCw,
  BarChart3,
  FileBarChart,
  Settings as SettingsIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useWorkspace } from "@/components/workspace-provider";
import {
  MeetingCreateDialog,
  TaskCreateDialog,
} from "@/components/workspace-actions";
import type {
  Insight,
  Meeting,
  Overview,
  Report,
  Task,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { CardSkeleton, ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const title: Record<string, [string, string, string]> = {
  overview: [
    "EXECUTION PULSE",
    "Your team is moving with purpose.",
    "Live data from meetings, tasks, and connected tools.",
  ],
  meetings: [
    "MEETING INTELLIGENCE",
    "Every conversation, accountable.",
    "Recorded meetings and their execution trail.",
  ],
  tasks: [
    "EXECUTION",
    "Work that moves the business.",
    "Prioritized by risk, ownership, and recent activity.",
  ],
  people: [
    "PEOPLE",
    "Capacity without surveillance.",
    "Directory people receive messages but never dashboard access by default.",
  ],
  analytics: [
    "ANALYTICS",
    "Learn where execution slows.",
    "Confidence-scored insights from your workspace.",
  ],
  integrations: [
    "INTEGRATIONS",
    "Your execution signal layer.",
    "Connect only the tools your team uses.",
  ],
  reports: [
    "REPORTS",
    "A weekly operating rhythm.",
    "Friday summaries for workspace owners and administrators.",
  ],
  settings: [
    "SETTINGS",
    "Workspace controls.",
    "Owner and administrator settings.",
  ],
};
function Header({ page, action }: { page: string; action?: React.ReactNode }) {
  const [eyebrow, heading, copy] = title[page];
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-medium tracking-[.16em] text-emerald-300">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{copy}</p>
      </div>
      {action}
    </div>
  );
}
function State({
  error,
  loading,
  empty,
  emptyIcon,
  emptyAction,
}: {
  error?: string;
  loading: boolean;
  empty: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
}) {
  if (loading) return null;
  if (error)
    return (
      <Card className="border-amber-300/20 p-8 text-sm text-amber-100">
        <p className="font-medium">Unable to load this workspace</p>
        <p className="mt-2 text-zinc-500">{error}</p>
        <p className="mt-4 text-xs text-zinc-600">
          Sign in, then select a workspace from the header.
        </p>
      </Card>
    );
  if (emptyIcon) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={empty}
        description=""
      >
        {emptyAction}
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={<ListChecks size={24} />}
      title={empty}
      description=""
    />
  );
}
function TaskRows({ tasks }: { tasks: Task[] }) {
  if (!tasks.length)
    return <p className="p-6 text-sm text-zinc-500">No tasks yet.</p>;
  return (
    <div className="divide-y divide-white/[.06]">
      {tasks.map((task) => (
        <Link
          href={`/tasks/${task.id}`}
          key={task.id}
          className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[.03]"
        >
          <i
            className={`h-2 w-2 rounded-full ${task.state === "blocked" ? "bg-rose-400" : task.state === "overdue" ? "bg-amber-300" : "bg-emerald-300"}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {task.due_at
                ? new Date(task.due_at).toLocaleDateString()
                : "No deadline"}{" "}
              · {task.state}
            </p>
          </div>
          <span className="text-sm text-emerald-300">
            {Math.round(task.execution_score)}
          </span>
        </Link>
      ))}
    </div>
  );
}
function OverviewPage() {
  const { workspaceId } = useWorkspace();
  const q = useApi<Overview>(
    workspaceId ? `/workspaces/${workspaceId}/overview` : "",
  );
  if (q.loading)
    return (
      <>
        <Header page="overview" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <Card className="mt-6">
          <div className="border-b border-white/[.08] p-5">
            <Skeleton className="h-5 w-32" />
          </div>
          <ListSkeleton count={4} />
        </Card>
      </>
    );
  if (q.error || !q.data)
    return (
      <>
        <Header page="overview" />
        <EmptyState
          icon={<BarChart3 size={24} />}
          title="No execution data yet"
          description="Add a meeting and let the AI bot extract decisions. Tasks and execution scores will appear here."
          actionLabel="Add a meeting"
          actionHref="/meetings"
        />
      </>
    );
  const d = q.data;
  return (
    <>
      <Header page="overview" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Execution score", d.execution_score],
          ["On-track work", `${d.on_track} / ${d.task_count}`],
          ["Meetings", d.meetings],
          ["At risk", d.at_risk],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-5">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-4 text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <div className="border-b border-white/[.08] p-5">
          <p className="font-medium">Execution radar</p>
        </div>
        <TaskRows tasks={d.tasks} />
      </Card>
    </>
  );
}
function MeetingsPage() {
  const { workspaceId } = useWorkspace();
  const q = useApi<Meeting[]>(
    workspaceId ? `/workspaces/${workspaceId}/meetings` : "",
  );
  return (
    <>
      <Header
        page="meetings"
        action={<MeetingCreateDialog onCreated={q.reload} />}
      />
      {q.loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : q.error ? (
        <State error={q.error} loading={false} empty="" />
      ) : q.data && q.data.length > 0 ? (
        <div className="grid gap-4">
          {q.data.map((m) => (
            <Link href={`/meetings/${m.id}`} key={m.id}>
              <Card className="flex items-center gap-4 p-5 transition hover:bg-white/[.03]">
                <CalendarClock className="text-violet-300" />
                <div className="flex-1">
                  <p className="font-medium">{m.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {m.provider.replace("_", " ")} · {m.status}
                  </p>
                </div>
                <span className="text-xs text-zinc-500">
                  {m.started_at
                    ? new Date(m.started_at).toLocaleDateString()
                    : "Scheduled"}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarClock size={24} />}
          title="No meetings captured yet"
          description={`Click "Add meeting" above to send an AI bot to your next Google Meet, Zoom, or Teams call.`}
        />
      )}
    </>
  );
}
function TasksPage() {
  const { workspaceId } = useWorkspace();
  const q = useApi<Task[]>(
    workspaceId ? `/workspaces/${workspaceId}/tasks` : "",
  );
  return (
    <>
      <Header page="tasks" action={<TaskCreateDialog onCreated={q.reload} />} />
      <Card>
        {q.loading ? (
          <ListSkeleton count={5} />
        ) : q.error ? (
          <State error={q.error} loading={false} empty="" />
        ) : q.data ? (
          <TaskRows tasks={q.data} />
        ) : (
          <EmptyState
            icon={<ListChecks size={24} />}
            title="No tasks yet"
            description="Tasks are created from meeting extractions, or you can create one manually with the button above."
          />
        )}
      </Card>
    </>
  );
}
function AnalyticsPage() {
  const { workspaceId } = useWorkspace();
  const q = useApi<Insight[]>(
    workspaceId ? `/workspaces/${workspaceId}/insights` : "",
  );
  return (
    <>
      <Header page="analytics" />
      {q.loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : q.error ? (
        <State error={q.error} loading={false} empty="" />
      ) : q.data && q.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((i) => (
            <Card key={i.id} className="p-5">
              <p className="text-sm text-zinc-500">
                {i.key.replaceAll("_", " ")}
              </p>
              <p className="mt-3 text-lg font-medium">
                {String(i.value.value ?? "Insufficient data")}
              </p>
              <p className="mt-2 text-xs text-emerald-300">
                {Math.round(i.confidence * 100)}% confidence
              </p>
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                {i.explanation}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Lightbulb size={24} />}
          title="No insights yet"
          description="Insights are generated from your weekly execution reports. Generate your first report to see trends and patterns."
          actionLabel="Go to reports"
          actionHref="/reports"
        />
      )}
    </>
  );
}
function ReportsPage() {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const q = useApi<Report[]>(
    workspaceId ? `/execution/workspaces/${workspaceId}/reports` : "",
  );
  const [creating, setCreating] = useState(false);
  const generate = async () => {
    setCreating(true);
    try {
      await api(`/execution/workspaces/${workspaceId}/reports`, {
        method: "POST",
      });
      toast("Report generation started", "success");
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to generate", "error");
    } finally {
      setCreating(false);
    }
  };
  return (
    <>
      <Header
        page="reports"
        action={
          <Button
            disabled={!workspaceId || creating}
            onClick={() => void generate()}
          >
            <RefreshCw size={15} />
            {creating ? "Generating…" : "Generate report"}
          </Button>
        }
      />
      {q.loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : q.error ? (
        <State error={q.error} loading={false} empty="" />
      ) : q.data && q.data.length > 0 ? (
        <div className="grid gap-4">
          {q.data.map((r) => (
            <Card key={r.id} className="flex items-center gap-4 p-5">
              <FileText className="text-emerald-300" />
              <div className="flex-1">
                <p className="font-medium">Weekly execution report</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(r.period_start).toLocaleDateString()} · Score{" "}
                  {r.data.execution_score}
                </p>
              </div>
              {r.pdf_url ? (
                <a className="text-sm text-emerald-300" href={r.pdf_url}>
                  Download PDF
                </a>
              ) : (
                <span className="text-xs text-zinc-500">Generating</span>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileBarChart size={24} />}
          title="No reports generated yet"
          description={`Click "Generate report" above to create a weekly execution summary with completion rates and trend scores.`}
        />
      )}
    </>
  );
}
function SettingsPage() {
  const { workspaceId, me, refresh } = useWorkspace();
  const toast = useToast();
  const q = useApi<{
    id: string;
    name: string;
    settings: Record<string, unknown>;
  }>(workspaceId ? `/settings/workspaces/${workspaceId}` : "");
  const [name, setName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileTz, setProfileTz] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const saveWorkspace = async () => {
    if (!q.data) return;
    setSavingWorkspace(true);
    try {
      await api(`/settings/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name || q.data.name,
          settings: q.data.settings,
        }),
      });
      toast("Workspace settings saved", "success");
      await q.reload();
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setSavingWorkspace(false);
    }
  };
  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: profileName || undefined,
          timezone: profileTz || undefined,
        }),
      });
      toast("Profile updated", "success");
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Profile update failed", "error");
    } finally {
      setSavingProfile(false);
    }
  };
  if (q.loading)
    return (
      <>
        <Header page="settings" />
        <div className="max-w-2xl space-y-5">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      </>
    );
  if (q.error || !q.data)
    return (
      <>
        <Header page="settings" />
        <EmptyState
          icon={<SettingsIcon size={24} />}
          title="Select a workspace"
          description="Choose a workspace from the header dropdown to manage its settings."
        />
      </>
    );
  return (
    <>
      <Header page="settings" />
      <div className="grid gap-5 max-w-2xl">
        <Card className="p-5">
          <p className="font-medium">Workspace profile</p>
          <label className="mt-5 block text-xs text-zinc-400">
            Workspace name
            <input
              value={name || q.data.name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
            />
          </label>
          <Button className="mt-5" disabled={savingWorkspace} onClick={() => void saveWorkspace()}>
            {savingWorkspace ? "Saving…" : "Save workspace"}
          </Button>
        </Card>
        <Card className="p-5">
          <p className="font-medium">Your profile</p>
          <p className="mt-1 text-xs text-zinc-500">
            Update your display name and timezone.
          </p>
          <label className="mt-5 block text-xs text-zinc-400">
            Display name
            <input
              value={profileName || (me?.name ?? "")}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder={me?.name}
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
            />
          </label>
          <label className="mt-4 block text-xs text-zinc-400">
            Timezone
            <input
              value={profileTz}
              onChange={(e) => setProfileTz(e.target.value)}
              placeholder="America/New_York"
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
            />
          </label>
          <Button className="mt-5" disabled={savingProfile} onClick={() => void saveProfile()}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </Card>
        <Card className="p-5">
          <p className="font-medium">Automation</p>
          <p className="mt-1 text-xs text-zinc-500">
            Configure how CloseLoop nudges and escalates.
          </p>
          <Link className="mt-4 block text-sm text-emerald-300" href="/approvals">
            Review extracted task approvals →
          </Link>
          <Link
            className="mt-3 block text-sm text-emerald-300"
            href="/settings/escalations"
          >
            Configure escalation rules →
          </Link>
        </Card>
      </div>
    </>
  );
}
export function WorkspacePage({
  page,
}: {
  page:
    | "overview"
    | "meetings"
    | "tasks"
    | "analytics"
    | "reports"
    | "settings";
}) {
  const component = {
    overview: <OverviewPage />,
    meetings: <MeetingsPage />,
    tasks: <TasksPage />,
    analytics: <AnalyticsPage />,
    reports: <ReportsPage />,
    settings: <SettingsPage />,
  }[page];
  return (
    <div className="min-h-[calc(100vh-70px)] bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,.06),transparent_38%)] p-5 lg:p-8">
      {component}
    </div>
  );
}
