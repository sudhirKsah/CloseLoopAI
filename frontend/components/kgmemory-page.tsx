"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Send,
  TrendingUp,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import * as kg from "@/lib/kgmemory";

type Tab = "chat" | "team" | "jira" | "actions";

const TABS: { id: Tab; label: string; icon: typeof Brain; desc: string }[] = [
  { id: "chat", label: "Chat with PM", icon: MessageSquare, desc: "Ask your AI PM anything" },
  { id: "team", label: "Team", icon: Users, desc: "Profiles, onboarding, check-ins" },
  { id: "jira", label: "Jira", icon: ListChecks, desc: "Issues synced from Jira" },
  { id: "actions", label: "Actions", icon: Activity, desc: "Alerts and pending PM actions" },
];

export function KgMemoryPage() {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("chat");

  useEffect(() => {
    if (!workspaceId) return;
    kg
      .kgStatus(workspaceId)
      .then((r) => setConnected(r.connected))
      .catch(() => setConnected(false));
  }, [workspaceId]);

  if (!workspaceId) {
    return (
      <Layout>
        <p className="text-sm text-zinc-500">Select a workspace first.</p>
      </Layout>
    );
  }

  if (connected === null) {
    return (
      <Layout>
        <Skeleton className="h-10 w-48 rounded-xl" />
      </Layout>
    );
  }

  if (!connected) {
    return (
      <Layout>
        <Card className="border-amber-300/20 p-8">
          <div className="flex items-start gap-4">
            <Brain className="mt-0.5 size-6 text-amber-300" />
            <div>
              <p className="text-sm font-medium">Memory not connected</p>
              <p className="mt-1 text-xs text-zinc-500">
                Connect the Knowledge Graph Memory integration to unlock the AI PM.
              </p>
            </div>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === "chat" && <ChatTab workspaceId={workspaceId} toast={toast} />}
      {tab === "team" && <TeamTab workspaceId={workspaceId} toast={toast} />}
      {tab === "jira" && <JiraTab workspaceId={workspaceId} toast={toast} />}
      {tab === "actions" && <ActionsTab workspaceId={workspaceId} toast={toast} />}
    </Layout>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────

function Layout({
  children,
  activeTab,
  onTabChange,
}: {
  children: React.ReactNode;
  activeTab?: Tab;
  onTabChange?: (t: Tab) => void;
}) {
  return (
    <main className="p-5 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        AI Project Manager
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your AI PM talks to the team on Slack, tracks progress, and helps you
        make decisions.
      </p>
      {activeTab && onTabChange && (
        <div className="mt-6 flex gap-1 rounded-xl border border-white/[.06] bg-white/[.02] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === t.id
                  ? "bg-violet-500/20 text-violet-200"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-6">{children}</div>
    </main>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────

type ChatMsg = { role: "user" | "pm"; text: string; id?: string; actions?: { action: string; target: string; message: string; urgency: string }[] };

type ExecutableAction = {
  action: string;
  target: string;
  message: string;
  urgency: string;
  status?: "pending" | "running" | "done" | "error";
  result?: string;
};

const PM_GREETING: ChatMsg = {
  role: "pm",
  text: "Hi! I'm your AI PM. I can tell you about your team, help you plan work, or check on progress. What do you want to know?",
};

function ChatTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([PM_GREETING]);
  const [actionState, setActionState] = useState<Record<string, ExecutableAction[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted chat history on mount so the conversation survives
  // tab switches and page reloads (like ChatGPT).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const history = await kg.kgListChat(workspaceId);
        if (cancelled) return;
        if (history.length === 0) {
          setMessages([PM_GREETING]);
          setActionState({});
        } else {
          setMessages(
            history.map((m) => ({
              role: m.role,
              text: m.text,
              id: m.id,
              actions: (m.actions ?? undefined) as ChatMsg["actions"],
            })),
          );
          const next: Record<string, ExecutableAction[]> = {};
          for (const m of history) {
            if (m.id && m.actions && m.actions.length > 0) {
              next[m.id] = m.actions as ExecutableAction[];
            }
          }
          setActionState(next);
        }
      } catch {
        if (!cancelled) toast("Failed to load chat history", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, toast]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      // Persist the user's message (best-effort; don't block the reply).
      void kg.kgCreateChat(workspaceId, { role: "user", text: q }).catch(() => {});

      const r = await kg.kgDecide(workspaceId, {
        query: q,
        audience: "founder_non_technical",
      });
      const rawActions = (r.suggested_actions as ExecutableAction[])?.filter(
        (a) => a.action !== "none",
      ) || [];
      const actions = rawActions.map((a) => ({ ...a, status: "pending" as const }));

      // Persist the PM response (with its suggested actions) and use the
      // server-assigned id to track action execution state.
      let pmId = `pm-${Date.now()}`;
      try {
        const saved = await kg.kgCreateChat(workspaceId, {
          role: "pm",
          text: r.response_text || "I couldn't process that right now.",
          actions: actions.length > 0 ? actions : null,
        });
        pmId = saved.id;
      } catch {
        toast("Chat history could not be saved", "error");
      }

      setMessages((m) => [
        ...m,
        {
          role: "pm",
          text: r.response_text || "I couldn't process that right now.",
          actions: actions,
          id: pmId,
        },
      ]);
      if (actions.length > 0) {
        setActionState((s) => ({ ...s, [pmId]: actions }));
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "pm", text: "Sorry, I had trouble processing that. Try again?" },
      ]);
      toast("Failed to get response", "error");
    } finally {
      setBusy(false);
    }
  };

  const executeAction = async (msgId: string, actionIdx: number) => {
    const actions = actionState[msgId];
    if (!actions || !actions[actionIdx]) return;
    const action = actions[actionIdx];

    setActionState((s) => ({
      ...s,
      [msgId]: s[msgId].map((a, i) => i === actionIdx ? { ...a, status: "running" } : a),
    }));

    try {
      let result = "";
      if (action.action === "create_task") {
        const projectName = action.target || "general";
        const taskMatch = action.message.match(/task[:\s]+(.+)/i);
        const title = taskMatch ? taskMatch[1] : action.message;
        const skillsMatch = action.message.match(/skills?[:\s]+(.+)/i);
        const skills = skillsMatch ? skillsMatch[1].split(/[,;]/).map((s: string) => s.trim()) : [];
        await kg.kgCreateTask(workspaceId, {
          title,
          project: projectName,
          required_skills: skills,
        });
        // Also create a Jira issue if connected
        try {
          const integrations = await kg.listIntegrations(workspaceId);
          const jira = integrations.find((i) => i.provider === "jira" && i.state === "connected");
          if (jira) {
            await kg.createJiraIssue(jira.id, title, action.message);
            result = `Task "${title}" created in ${projectName} and synced to Jira`;
          } else {
            result = `Task "${title}" created in ${projectName}`;
          }
        } catch {
          result = `Task "${title}" created in ${projectName}`;
        }
      } else if (action.action === "assign_task") {
        result = "Assignment suggested — see Team tab";
      } else if (action.action === "check_in_engineer") {
        const person = action.target;
        await kg.kgCheckIn(workspaceId, person);
        result = `Check-in sent to ${person} on Slack`;
      } else if (action.action === "onboard") {
        const person = action.target;
        await kg.kgAutoOnboard(workspaceId);
        result = `Onboarding started for ${person}`;
      } else if (action.action === "ping") {
        const person = action.target;
        await kg.kgCheckIn(workspaceId, person);
        result = `Pinged ${person} on Slack`;
      } else {
        result = "Action noted";
      }

      const updated = actions.map((a, i) =>
        i === actionIdx ? { ...a, status: "done" as const, result } : a,
      );
      setActionState((s) => ({ ...s, [msgId]: updated }));
      void kg.kgUpdateChatActions(workspaceId, msgId, updated).catch(() => {});
      toast(result, "success");
    } catch {
      const updated = actions.map((a, i) =>
        i === actionIdx ? { ...a, status: "error" as const } : a,
      );
      setActionState((s) => ({ ...s, [msgId]: updated }));
      void kg.kgUpdateChatActions(workspaceId, msgId, updated).catch(() => {});
      toast("Action failed", "error");
    }
  };

  const executeAll = async (msgId: string) => {
    const actions = actionState[msgId];
    if (!actions) return;
    for (let i = 0; i < actions.length; i++) {
      if (actions[i].status === "pending") {
        await executeAction(msgId, i);
      }
    }
  };

  const clearChat = async () => {
    if (busy || loading) return;
    try {
      await kg.kgClearChat(workspaceId);
    } catch {
      toast("Failed to clear chat", "error");
      return;
    }
    setMessages([PM_GREETING]);
    setActionState({});
    toast("Chat cleared", "info");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, actionState]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-zinc-500">Conversation history is saved for you.</p>
        <button
          onClick={clearChat}
          disabled={busy || loading}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:bg-white/[.05] hover:text-zinc-200 disabled:opacity-40"
        >
          <Trash2 size={13} /> Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        className="h-[60vh] space-y-4 overflow-y-auto rounded-2xl border border-white/[.06] bg-white/[.01] p-4"
      >
        {loading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/[.04] px-4 py-2.5 text-sm text-zinc-400">
              <RefreshCw size={14} className="inline animate-spin" /> Loading chat...
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-violet-500/20 text-violet-100"
                    : "bg-white/[.04] text-zinc-200"
                }`}
              >
                {m.text}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500">
                        {m.actions.length} action(s) suggested:
                      </p>
                      {m.id && actionState[m.id] && actionState[m.id].some((a) => a.status === "pending") && (
                        <button
                          onClick={() => executeAll(m.id!)}
                          className="text-xs font-medium text-violet-300 hover:text-violet-200"
                        >
                          Run all
                        </button>
                      )}
                    </div>
                    {m.actions.map((a, j) => {
                      const state = m.id ? actionState[m.id]?.[j] : undefined;
                      const status = state?.status || "pending";
                      return (
                        <div key={j} className="rounded-lg border border-white/[.06] bg-white/[.02] p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-medium ${
                                  a.urgency === "high" ? "text-red-400" :
                                  a.urgency === "medium" ? "text-amber-400" : "text-emerald-400"
                                }`}>
                                  {a.urgency.toUpperCase()}
                                </span>
                                <span className="text-xs text-zinc-500">{a.action.replace(/_/g, " ")}</span>
                                {status === "done" && <CheckCircle2 size={11} className="text-emerald-400" />}
                                {status === "running" && <RefreshCw size={11} className="text-zinc-400 animate-spin" />}
                                {status === "error" && <AlertTriangle size={11} className="text-red-400" />}
                              </div>
                              <p className="mt-1 text-xs text-zinc-300">
                                {a.message}
                              </p>
                              {state?.result && (
                                <p className="mt-1 text-xs text-emerald-400">{state.result}</p>
                              )}
                            </div>
                            {status === "pending" && (
                              <button
                                onClick={() => executeAction(m.id!, j)}
                                className="shrink-0 rounded-md bg-violet-500/20 px-2 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/30"
                              >
                                Run
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/[.04] px-4 py-2.5 text-sm text-zinc-400">
              <RefreshCw size={14} className="inline animate-spin" /> Thinking...
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your team, plan a project, or check progress..."
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || !input.trim()}>
          <Send size={15} />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          "How is my team doing?",
          "I want to build a new app",
          "Who is available for new work?",
          "Plan the next sprint",
        ].map((s) => (
          <button
            key={s}
            onClick={() => !busy && setInput(s)}
            className="rounded-full border border-white/[.08] bg-white/[.02] px-3 py-1 text-xs text-zinc-400 transition hover:bg-white/[.05] hover:text-zinc-200"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Team Tab ──────────────────────────────────────────────────────────────

function TeamTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [people, setPeople] = useState<kg.KgPersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<kg.KgPerson>();
  const [selectedStatus, setSelectedStatus] = useState<kg.KgOnboardingStatus>();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPeople(await kg.kgListPeople(workspaceId));
    } catch {
      toast("Failed to load team", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const open = async (name: string) => {
    setBusy(true);
    try {
      const [p, s] = await Promise.all([
        kg.kgGetPerson(workspaceId, name),
        kg.kgOnboardingStatus(workspaceId, name).catch(() => null),
      ]);
      setSelected(p);
      setSelectedStatus(s ?? undefined);
    } catch {
      toast("Failed to load profile", "error");
    } finally {
      setBusy(false);
    }
  };

  const autoOnboard = async () => {
    setBusy(true);
    try {
      const r = await kg.kgAutoOnboard(workspaceId);
      toast(`Onboarded ${r.count} member(s) on Slack`, "success");
      void load();
    } catch {
      toast("Auto-onboard failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const autoCheckIn = async () => {
    setBusy(true);
    try {
      const r = await kg.kgAutoCheckIn(workspaceId);
      toast(`Sent check-ins to ${r.count} member(s)`, "success");
    } catch {
      toast("Check-in failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const startOnboarding = async (name: string) => {
    setBusy(true);
    try {
      await kg.kgStartOnboarding(workspaceId, name);
      toast(`Started onboarding for ${name}`, "success");
      void open(name);
    } catch {
      toast("Failed to start onboarding", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* PM Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={autoOnboard} disabled={busy} size="sm">
          <Send size={13} /> Onboard team on Slack
        </Button>
        <Button onClick={autoCheckIn} disabled={busy} size="sm" variant="secondary">
          <MessageSquare size={13} /> Check in on Slack
        </Button>
        <Button onClick={load} disabled={loading} size="sm" variant="ghost">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Team list */}
        <div className="space-y-2 lg:col-span-1">
          {loading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : people.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-zinc-500">No team members yet.</p>
              <p className="mt-1 text-xs text-zinc-600">
                Click "Onboard team" to invite them on Slack.
              </p>
            </Card>
          ) : (
            people.map((p) => (
              <button
                key={p.name}
                onClick={() => open(p.name)}
                className="w-full rounded-xl border border-white/[.06] bg-white/[.02] p-3 text-left transition hover:bg-white/[.05]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-zinc-200">
                    {p.name}
                  </span>
                  <ReliabilityBadge score={p.reliability_score} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.title ?? p.role} · {p.completed_count} done · {p.missed_count} missed
                </p>
              </button>
            ))
          )}
        </div>

        {/* Profile detail */}
        <Card className="p-5 lg:col-span-2">
          {!selected ? (
            <p className="py-16 text-center text-sm text-zinc-600">
              Select a team member to see their profile.
            </p>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold capitalize">{selected.name}</p>
                  <p className="text-xs text-zinc-500">{selected.title ?? selected.role}</p>
                </div>
                <ReliabilityBadge
                  score={(selected.reliability?.score as number | undefined) ?? 0}
                />
              </div>

              {/* Onboarding status */}
              {selectedStatus && (
                <div className="mt-3 flex items-center gap-2">
                  {selectedStatus.completed ? (
                    <Badge variant="success">
                      <CheckCircle2 size={11} /> Onboarded
                    </Badge>
                  ) : selectedStatus.started ? (
                    <Badge variant="warning">
                      Onboarding: {selectedStatus.step}
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="default">Not onboarded</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startOnboarding(selected.name)}
                        disabled={busy}
                      >
                        Start
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Rich profile */}
              {selected.facts && selected.facts.length > 0 ? (
                <ProfileFacts facts={selected.facts} />
              ) : (
                <p className="mt-6 py-8 text-center text-xs text-zinc-600">
                  No profile data yet. The PM learns this during onboarding.
                </p>
              )}

              {/* Structured info */}
              {(selected.availability_hours_per_week || selected.timezone) && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {selected.availability_hours_per_week && (
                    <InfoBox icon={Clock} label="Available">
                      {selected.availability_hours_per_week} hrs/week
                    </InfoBox>
                  )}
                  {selected.timezone && (
                    <InfoBox icon={Activity} label="Timezone">
                      {selected.timezone}
                    </InfoBox>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProfileFacts({ facts }: { facts: Record<string, unknown>[] }) {
  type Group = {
    label: string;
    icon: typeof Users;
    color: string;
    items: { value: string; predicate: string }[];
  };

  const groups: Record<string, Group> = {
    identity: { label: "Role", icon: Users, color: "text-emerald-400", items: [] },
    experience: { label: "Experience", icon: TrendingUp, color: "text-cyan-400", items: [] },
    skill: { label: "Skills & Tech", icon: Zap, color: "text-blue-400", items: [] },
    availability: { label: "Availability", icon: Clock, color: "text-amber-400", items: [] },
    preference: { label: "Interests", icon: Brain, color: "text-purple-400", items: [] },
    work_style: { label: "Work Style", icon: MessageSquare, color: "text-pink-400", items: [] },
    fact: { label: "Other", icon: Activity, color: "text-zinc-400", items: [] },
  };

  const seen = new Set<string>();
  for (const f of facts) {
    const kind = (f.fact_kind as string) || "fact";
    const value = (f.value as string) || "";
    const predicate = (f.predicate as string) || "";
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (groups[kind]) {
      groups[kind].items.push({ value, predicate });
    } else {
      groups.fact.items.push({ value, predicate });
    }
  }

  const ordered = Object.values(groups).filter((g) => g.items.length > 0);
  if (ordered.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {ordered.map((g) => (
        <div key={g.label}>
          <div className="flex items-center gap-1.5">
            <g.icon size={12} className={g.color} />
            <p className="text-xs uppercase tracking-wider text-zinc-500">{g.label}</p>
          </div>
          <div className="mt-2">
            {g.label === "Skills & Tech" ? (
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((item, i) => (
                  <Badge key={i} variant="default">{item.value}</Badge>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {g.items.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-white/[.04] bg-white/[.01] px-3 py-2"
                  >
                    <span className={`text-xs font-medium ${g.color}`}>
                      {item.predicate}
                    </span>
                    <span className="ml-1.5 text-sm text-zinc-200">{item.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReliabilityBadge({ score }: { score: number }) {
  const variant = score >= 0.7 ? "success" : score >= 0.4 ? "warning" : "danger";
  return (
    <Badge variant={variant}>
      {Math.round(score * 100)}%
    </Badge>
  );
}

function InfoBox({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[.04] bg-white/[.01] p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className="text-zinc-500" />
        <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      </div>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

// ── Jira Tab ──────────────────────────────────────────────────────────────

function JiraTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [issues, setIssues] = useState<kg.JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [newSummary, setNewSummary] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const integrations = await kg.listIntegrations(workspaceId);
      const jira = integrations.find((i) => i.provider === "jira" && i.state === "connected");
      if (!jira) {
        setIntegrationId(null);
        return;
      }
      setIntegrationId(jira.id);
      const result = await kg.listJiraIssues(jira.id);
      setIssues(result.issues);
      setProjectKey(result.project_key);
    } catch {
      toast("Failed to load Jira issues", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createIssue = async () => {
    if (!integrationId || !newSummary.trim()) return;
    setBusy(true);
    try {
      await kg.createJiraIssue(integrationId, newSummary.trim(), "");
      toast("Jira issue created", "success");
      setNewSummary("");
      void load();
    } catch {
      toast("Failed to create issue", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-32 rounded-xl" />;
  }

  if (!integrationId) {
    return (
      <Card className="p-8 text-center">
        <ListChecks className="mx-auto size-8 text-zinc-600" />
        <p className="mt-3 text-sm text-zinc-500">Jira not connected.</p>
        <p className="mt-1 text-xs text-zinc-600">
          Connect Jira from the Integrations page to see issues here.
        </p>
      </Card>
    );
  }

  const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("done") || s.includes("closed") || s.includes("complete")) return "success";
    if (s.includes("progress") || s.includes("review")) return "warning";
    if (s.includes("blocked") || s.includes("backlog")) return "default";
    return "default";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{projectKey} issues</p>
          <p className="text-xs text-zinc-500">{issues.length} issues from Jira</p>
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="ghost">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {/* Create new issue */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          value={newSummary}
          onChange={(e) => setNewSummary(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createIssue()}
          placeholder="New issue summary..."
          disabled={busy}
        />
        <Button onClick={createIssue} disabled={busy || !newSummary.trim()} size="sm">
          <Send size={13} /> Create
        </Button>
      </div>

      {issues.length === 0 ? (
        <Card className="p-8 text-center">
          <ListChecks className="mx-auto size-8 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-500">No issues in this project yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <Card key={issue.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-violet-300">{issue.key}</span>
                    <Badge variant={statusColor(issue.status) as "success" | "warning" | "default" | "danger"}>
                      {issue.status}
                    </Badge>
                    {issue.priority !== "None" && (
                      <span className="text-xs text-zinc-500">{issue.priority}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-200">{issue.summary}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {issue.assignee !== "Unassigned" ? issue.assignee : "Unassigned"}
                    {issue.updated && ` · Updated ${new Date(issue.updated).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Actions Tab ───────────────────────────────────────────────────────────

function ActionsTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [alerts, setAlerts] = useState<kg.KgAlert[]>([]);
  const [actions, setActions] = useState<kg.KgAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, act] = await Promise.all([
        kg.kgListAlerts(workspaceId).catch(() => []),
        kg.kgListActions(workspaceId).catch(() => []),
      ]);
      setAlerts(a);
      setActions(act);
    } catch {
      toast("Failed to load actions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const scan = async () => {
    setBusy(true);
    try {
      await kg.kgMonitorScan(workspaceId);
      toast("Scan complete", "success");
      void load();
    } catch {
      toast("Scan failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const ackAlert = async (id: string) => {
    setBusy(true);
    try {
      await kg.kgAckAlert(workspaceId, id);
      toast("Alert acknowledged", "success");
      void load();
    } catch {
      toast("Failed to acknowledge", "error");
    } finally {
      setBusy(false);
    }
  };

  const completeAction = async (id: string) => {
    setBusy(true);
    try {
      await kg.kgCompleteAction(workspaceId, id);
      toast("Action completed", "success");
      void load();
    } catch {
      toast("Failed to complete action", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-32 rounded-xl" />;
  }

  const hasContent = alerts.length > 0 || actions.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={scan} disabled={busy} size="sm">
          <Activity size={13} /> Scan for issues
        </Button>
        <Button onClick={load} disabled={loading} size="sm" variant="ghost">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {!hasContent ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
          <p className="mt-3 text-sm text-zinc-400">All clear — no alerts or pending actions.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Click "Scan for issues" to have the PM check for problems.
          </p>
        </Card>
      ) : (
        <>
          {alerts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-sm font-medium">Alerts ({alerts.length})</p>
              </div>
              <div className="space-y-2">
                {alerts.map((a) => (
                  <Card key={a.alert_id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={a.severity === "high" ? "danger" : a.severity === "medium" ? "warning" : "default"}>
                            {a.severity}
                          </Badge>
                          <span className="text-xs text-zinc-500">{a.alert_type}</span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-200">{a.message}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {a.person && `Person: ${a.person}`}
                          {a.project && ` · Project: ${a.project}`}
                        </p>
                      </div>
                      {a.status === "open" && (
                        <Button size="sm" variant="ghost" onClick={() => ackAlert(a.alert_id)} disabled={busy}>
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {actions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ListChecks size={14} className="text-blue-400" />
                <p className="text-sm font-medium">Pending actions ({actions.length})</p>
              </div>
              <div className="space-y-2">
                {actions.map((a) => (
                  <Card key={a.action_id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={a.urgency === "high" ? "danger" : a.urgency === "medium" ? "warning" : "default"}>
                            {a.urgency}
                          </Badge>
                          <span className="text-xs text-zinc-500">{a.action}</span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-200">{a.message}</p>
                        <p className="mt-1 text-xs text-zinc-500">Target: {a.target}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => completeAction(a.action_id)} disabled={busy}>
                        Done
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
