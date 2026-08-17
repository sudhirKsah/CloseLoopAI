"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  FileText,
  Lightbulb,
  ListChecks,
  RefreshCw,
  BarChart3,
  FileBarChart,
  Settings as SettingsIcon,
  LogOut,
  Mail,
  ShieldCheck,
  Bell,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  CreditCard,
  Crown,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useWorkspace } from "@/components/workspace-provider";
import { useAuth } from "@/components/auth-provider";
import { useSubscription } from "@/components/subscription-provider";
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
  const { logout } = useAuth();
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
  const [resending, setResending] = useState(false);
  const DEFAULT_NOTIFS: Record<string, boolean> = {
    email_task_reminders: true,
    email_reports: true,
    email_escalations: true,
    slack_task_reminders: true,
    slack_escalations: true,
  };
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(DEFAULT_NOTIFS);
  const [savingNotifs, setSavingNotifs] = useState(false);

  // Load notification preferences from me when available
  useEffect(() => {
    if (me?.notification_preferences) {
      setNotifPrefs({ ...DEFAULT_NOTIFS, ...me.notification_preferences });
    }
  }, [me?.notification_preferences]);

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
  const resendVerification = async () => {
    if (!me?.email) return;
    setResending(true);
    try {
      await api("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: me.email }),
      });
      toast("Verification email sent — check your inbox", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to resend", "error");
    } finally {
      setResending(false);
    }
  };
  const saveNotifs = async () => {
    setSavingNotifs(true);
    try {
      await api("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ notification_preferences: notifPrefs }),
      });
      toast("Notification preferences saved", "success");
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setSavingNotifs(false);
    }
  };

  if (q.loading)
    return (
      <>
        <Header page="settings" />
        <div className="max-w-3xl space-y-5">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
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

  const emailVerified = me?.is_email_verified ?? false;

  return (
    <>
      <Header page="settings" />
      <div className="grid gap-5 max-w-3xl">
        {/* Account / Email status */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-300" />
            <p className="font-medium">Account &amp; Email</p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3">
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-zinc-500" />
                <div>
                  <p className="text-sm text-white">{me?.email ?? "—"}</p>
                  <p className="text-[11px] text-zinc-500">Email address</p>
                </div>
              </div>
              {emailVerified ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  <CheckCircle2 size={13} /> Verified
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
                  <AlertCircle size={13} /> Unverified
                </span>
              )}
            </div>
            {!emailVerified && (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-400/15 bg-amber-400/[.04] px-4 py-3">
                <p className="text-xs text-amber-200/80">
                  Verify your email to secure your account and enable email notifications.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={resending}
                  onClick={() => void resendVerification()}
                >
                  {resending ? "Sending…" : "Resend link"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Subscription & Billing */}
        <SubscriptionCard />

        {/* Profile */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <User size={18} className="text-emerald-300" />
            <p className="font-medium">Your profile</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Update your display name and timezone.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Display name
              <input
                value={profileName || (me?.name ?? "")}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={me?.name}
                className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              <span className="flex items-center gap-1"><Clock size={12} /> Timezone</span>
              <input
                value={profileTz}
                onChange={(e) => setProfileTz(e.target.value)}
                placeholder="America/New_York"
                className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
              />
            </label>
          </div>
          <Button className="mt-5" disabled={savingProfile} onClick={() => void saveProfile()}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </Card>

        {/* Notification preferences */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-emerald-300" />
            <p className="font-medium">Notifications</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Choose how you want to be notified about activity.
          </p>
          <div className="mt-5 space-y-1">
            {[
              ["email_task_reminders", "Email — Task reminders", "Get notified about upcoming and overdue tasks"],
              ["email_reports", "Email — Weekly reports", "Receive Friday execution summaries"],
              ["email_escalations", "Email — Escalation alerts", "Be alerted when tasks are at risk"],
              ["slack_task_reminders", "Slack — Task reminders", "DM reminders for your assigned tasks"],
              ["slack_escalations", "Slack — Escalation alerts", "DM alerts for at-risk tasks"],
            ].map(([key, label, desc]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-white/[.03]"
              >
                <div>
                  <p className="text-sm text-white">{label}</p>
                  <p className="text-[11px] text-zinc-500">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${notifPrefs[key] ? "bg-emerald-300" : "bg-white/10"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${notifPrefs[key] ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </label>
            ))}
          </div>
          <Button className="mt-5" disabled={savingNotifs} onClick={() => void saveNotifs()}>
            {savingNotifs ? "Saving…" : "Save preferences"}
          </Button>
        </Card>

        {/* Workspace */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-emerald-300" />
            <p className="font-medium">Workspace profile</p>
          </div>
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

        {/* Automation */}
        <Card className="p-5">
          <p className="font-medium">Automation</p>
          <p className="mt-1 text-xs text-zinc-500">
            Configure how Pathayo nudges and escalates.
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

        {/* Danger zone — logout */}
        <Card className="border-rose-400/15 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-rose-300">Session</p>
              <p className="mt-1 text-xs text-zinc-500">
                Sign out of your Pathayo account on this device.
              </p>
            </div>
            <Button
              variant="secondary"
              className="border-rose-400/20 text-rose-300 hover:bg-rose-400/10"
              onClick={logout}
            >
              <LogOut size={15} className="mr-1.5" /> Log out
            </Button>
          </div>
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

function SubscriptionCard() {
  const { sub } = useSubscription();
  if (!sub) return null;

  const planLabel =
    sub.plan === "lifetime" ? "Lifetime" :
    sub.plan === "yearly" ? "Yearly" :
    sub.plan === "monthly" ? "Monthly" :
    sub.plan === "expired" ? "Expired" :
    "Free Trial";

  const statusLabel =
    sub.status === "active" ? "Active" :
    sub.status === "past_due" ? "Past due" :
    sub.status === "canceled" ? "Canceled" :
    sub.status === "expired" ? "Expired" : "Active";

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-emerald-300" />
        <p className="font-medium">Subscription &amp; Billing</p>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3">
          <div className="flex items-center gap-3">
            {sub.plan === "lifetime" ? (
              <Crown size={16} className="text-amber-300" />
            ) : (
              <CreditCard size={16} className="text-zinc-500" />
            )}
            <div>
              <p className="text-sm text-white">{planLabel}</p>
              <p className="text-[11px] text-zinc-500">Current plan</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            sub.status === "active"
              ? "bg-emerald-300/10 text-emerald-300"
              : "bg-red-400/10 text-red-300"
          }`}>
            {statusLabel}
          </span>
        </div>

        {sub.plan === "trial" && sub.trial_end && (
          <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3">
            <div>
              <p className="text-sm text-white">
                {sub.days_remaining > 0
                  ? `${sub.days_remaining} day${sub.days_remaining === 1 ? "" : "s"} remaining`
                  : "Trial ended"}
              </p>
              <p className="text-[11px] text-zinc-500">
                Trial ends {new Date(sub.trial_end).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}

        {sub.paid_until && (sub.plan === "monthly" || sub.plan === "yearly") && (
          <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3">
            <div>
              <p className="text-sm text-white">
                Renews {new Date(sub.paid_until).toLocaleDateString()}
              </p>
              <p className="text-[11px] text-zinc-500">
                {sub.days_remaining} day{sub.days_remaining === 1 ? "" : "s"} left in billing period
              </p>
            </div>
          </div>
        )}

        {sub.is_platform_admin && (
          <p className="text-xs text-zinc-500">
            You have platform admin access — all features unlocked.
          </p>
        )}

        <Link href="/payments">
          <Button variant="secondary" size="sm" className="w-full">
            {sub.plan === "trial" && sub.days_remaining <= 7
              ? "Upgrade now"
              : "Manage billing"}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
