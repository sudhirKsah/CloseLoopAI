"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bell,
  Brain,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Flag,
  Gauge,
  GitBranch,
  Lightbulb,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
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

type Tab =
  | "ask"
  | "memory"
  | "people"
  | "projects"
  | "monitor"
  | "actions"
  | "planning"
  | "sprints"
  | "stakeholders"
  | "team";

const TABS: { id: Tab; label: string; icon: typeof Brain }[] = [
  { id: "ask", label: "Ask the PM", icon: Brain },
  { id: "memory", label: "Memory", icon: Search },
  { id: "people", label: "People", icon: Users },
  { id: "projects", label: "Projects", icon: Target },
  { id: "monitor", label: "Monitor", icon: AlertTriangle },
  { id: "actions", label: "Actions", icon: ListChecks },
  { id: "planning", label: "Planning", icon: GitBranch },
  { id: "sprints", label: "Sprints", icon: Flag },
  { id: "stakeholders", label: "Stakeholders", icon: DollarSign },
  { id: "team", label: "Team", icon: MessageSquare },
];

export function KgMemoryPage() {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("ask");

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
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
              <Zap size={18} />
            </span>
            <div className="flex-1">
              <p className="font-medium">Knowledge Graph Memory is not connected</p>
              <p className="mt-2 text-sm text-zinc-500">
                Connect it on the Integrations page to unlock the AI PM brain,
                engineer reliability scoring, autonomous monitoring, and
                cross-meeting memory.
              </p>
              <Link href="/integrations" className="mt-4 inline-block">
                <Button size="sm" variant="secondary">
                  Go to Integrations
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-wrap gap-1.5 border-b border-white/[.06] pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition " +
                (tab === t.id
                  ? "bg-white/[.09] text-white"
                  : "text-zinc-500 hover:bg-white/[.045] hover:text-zinc-200")
              }
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        {tab === "ask" && <AskTab workspaceId={workspaceId} toast={toast} />}
        {tab === "memory" && <MemoryTab workspaceId={workspaceId} toast={toast} />}
        {tab === "people" && <PeopleTab workspaceId={workspaceId} toast={toast} />}
        {tab === "projects" && <ProjectsTab workspaceId={workspaceId} toast={toast} />}
        {tab === "monitor" && <MonitorTab workspaceId={workspaceId} toast={toast} />}
        {tab === "actions" && <ActionsTab workspaceId={workspaceId} toast={toast} />}
        {tab === "planning" && <PlanningTab workspaceId={workspaceId} toast={toast} />}
        {tab === "sprints" && <SprintsTab workspaceId={workspaceId} toast={toast} />}
        {tab === "stakeholders" && <StakeholdersTab workspaceId={workspaceId} toast={toast} />}
        {tab === "team" && <TeamTab workspaceId={workspaceId} toast={toast} />}
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="p-5 lg:p-8">
      <p className="text-[11px] font-medium tracking-[.16em] text-violet-300">
        KNOWLEDGE GRAPH MEMORY
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
        AI PM brain.
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Cross-meeting memory, reliability scoring, and autonomous monitoring.
      </p>
      <div className="mt-7">{children}</div>
    </main>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────

function useBusy() {
  const [busy, setBusy] = useState(false);
  return { busy, run: async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  } };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60";

const textareaClass =
  "w-full rounded-xl border border-white/10 bg-white/[.04] p-3 text-sm text-white outline-none transition focus:border-emerald-300/60";

function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-xl border border-white/[.06] bg-black/40 p-3 text-xs leading-relaxed text-zinc-300">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Brain;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
      <Icon size={15} className="text-violet-300" />
      {children}
    </div>
  );
}

// ── Ask the PM tab ────────────────────────────────────────────────────────

function AskTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("founder_non_technical");
  const [result, setResult] = useState<kg.KgDecision>();
  const [digest, setDigest] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  const ask = async () => {
    if (!query.trim()) return;
    const r = await run(() =>
      kg.kgDecide(workspaceId, { query, audience }),
    );
    if (r) {
      setResult(r);
      toast("Decision generated", "success");
    } else {
      toast("Failed to get decision", "error");
    }
  };

  const getDigest = async () => {
    const r = await run(() => kg.kgFounderDigest(workspaceId, audience));
    if (r) {
      setDigest(r);
      toast("Founder digest generated", "success");
    } else {
      toast("Failed to generate digest", "error");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle icon={Brain}>Ask the AI PM</SectionTitle>
        <p className="mt-1 text-xs text-zinc-500">
          The PM reasons over cross-meeting memory and current project/person
          state, then responds with concrete suggested actions.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Question">
            <textarea
              className={textareaClass}
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Is the API project on track? Should I be worried?"
            />
          </Field>
          <Field label="Audience">
            <select
              className={inputClass}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="founder_non_technical">Founder (non-technical)</option>
              <option value="founder_technical">Founder (technical)</option>
              <option value="engineer">Engineer</option>
              <option value="internal">Internal</option>
            </select>
          </Field>
          <Button onClick={ask} disabled={busy || !query.trim()}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            Ask
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Sparkles}>Founder digest</SectionTitle>
        <p className="mt-1 text-xs text-zinc-500">
          A ruthlessly filtered digest — only what you need to know, max 5
          bullets, with a green/yellow/red urgency level.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={getDigest} disabled={busy}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generate digest
          </Button>
        </div>
        {digest && (
          <div className="mt-4">
            <JsonView data={digest} />
          </div>
        )}
      </Card>

      {result && (
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <SectionTitle icon={Brain}>Decision</SectionTitle>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  result.risk_level === "high"
                    ? "danger"
                    : result.risk_level === "medium"
                      ? "warning"
                      : "success"
                }
              >
                {result.risk_level} risk
              </Badge>
              <Badge variant="info">
                <Gauge size={11} /> {Math.round(result.confidence * 100)}% confidence
              </Badge>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
            {result.response_text}
          </p>
          {result.reasoning && (
            <details className="mt-3 text-xs text-zinc-500">
              <summary className="cursor-pointer select-none">Reasoning</summary>
              <p className="mt-2 whitespace-pre-wrap">{result.reasoning}</p>
            </details>
          )}
          {result.suggested_actions.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Suggested actions
              </p>
              <div className="mt-2 space-y-2">
                {result.suggested_actions.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
                  >
                    <Badge
                      variant={
                        String(a.urgency) === "high"
                          ? "danger"
                          : String(a.urgency) === "medium"
                            ? "warning"
                            : "default"
                      }
                    >
                      {String(a.action)}
                    </Badge>
                    <div className="flex-1 text-sm text-zinc-300">
                      <p className="font-medium text-zinc-200">
                        {String(a.target)}
                      </p>
                      <p className="mt-0.5 text-zinc-400">{String(a.message)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Memory tab ────────────────────────────────────────────────────────────

function MemoryTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<kg.KgSearchResponse>();
  const [facts, setFacts] = useState<kg.KgFact[]>([]);
  const [factFilter, setFactFilter] = useState("");
  const { busy, run } = useBusy();

  const search = async () => {
    if (!query.trim()) return;
    const r = await run(() => kg.kgSearch(workspaceId, { query }));
    if (r) {
      setSearchResult(r);
      toast(`Found ${r.facts.length} facts`, "success");
    } else {
      toast("Search failed", "error");
    }
  };

  const loadFacts = async () => {
    const r = await run(() =>
      kg.kgListFacts(workspaceId, factFilter ? { subject: factFilter } : { limit: 100 }),
    );
    if (r) setFacts(r);
  };

  useEffect(() => {
    void loadFacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle icon={Search}>Context search</SectionTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Hybrid retrieval: vector ANN + graph traversal + LLM rerank. Returns
          a prompt-context string plus structured facts and current states.
        </p>
        <div className="mt-4 space-y-3">
          <textarea
            className={textareaClass}
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What has Dave committed to recently?"
          />
          <Button onClick={search} disabled={busy || !query.trim()}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </Button>
        </div>
        {searchResult && (
          <div className="mt-4 space-y-3">
            {searchResult.project_states.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {searchResult.project_states.map((p, i) => (
                  <Badge key={i} variant="info">
                    {String(p.project)}: {String(p.health)}
                  </Badge>
                ))}
              </div>
            )}
            {searchResult.prompt_context && (
              <pre className="max-h-[300px] overflow-auto rounded-xl border border-white/[.06] bg-black/40 p-3 text-xs text-zinc-300">
                {searchResult.prompt_context}
              </pre>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={ClipboardList}>Facts in the graph</SectionTitle>
        <div className="mt-4 flex gap-2">
          <input
            className={inputClass}
            placeholder="Filter by subject..."
            value={factFilter}
            onChange={(e) => setFactFilter(e.target.value)}
          />
          <Button variant="secondary" onClick={loadFacts} disabled={busy}>
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          </Button>
        </div>
        <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
          {facts.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">No facts yet.</p>
          ) : (
            facts.map((f) => (
              <div
                key={f.fact_id}
                className="rounded-xl border border-white/[.06] bg-white/[.02] p-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="default">{f.fact_kind}</Badge>
                  <span className="text-xs text-zinc-500">{f.subject}</span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-200">
                  <span className="text-zinc-500">{f.predicate}</span>{" "}
                  {f.value}
                </p>
                {f.project && (
                  <p className="mt-1 text-xs text-zinc-600">project: {f.project}</p>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ── People tab ────────────────────────────────────────────────────────────

function PeopleTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [people, setPeople] = useState<kg.KgPersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<kg.KgPerson>();
  const [contributions, setContributions] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  const load = async () => {
    setLoading(true);
    try {
      setPeople(await kg.kgListPeople(workspaceId));
    } catch {
      toast("Failed to load people", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (name: string) => {
    const result = await run(async () =>
      Promise.all([
        kg.kgGetPerson(workspaceId, name),
        kg.kgPersonContributions(workspaceId, name),
      ]),
    );
    if (result) {
      const [p, c] = result;
      setSelected(p);
      setContributions(c);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-1">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Users}>Team reliability</SectionTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {loading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : people.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No people in memory yet.
            </p>
          ) : (
            people.map((p) => (
              <button
                key={p.name}
                onClick={() => open(p.name)}
                className="w-full rounded-xl border border-white/[.06] bg-white/[.02] p-3 text-left transition hover:bg-white/[.05]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-200">
                    {p.name}
                  </span>
                  <ReliabilityBadge score={p.reliability_score} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.title ?? p.role} · {p.completed_count} done ·{" "}
                  {p.missed_count} missed
                </p>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2">
        {!selected ? (
          <p className="py-16 text-center text-sm text-zinc-600">
            Select a person to see their full profile.
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{selected.name}</p>
                <p className="text-xs text-zinc-500">
                  {selected.title ?? selected.role}
                </p>
              </div>
              <ReliabilityBadge
                score={
                  (selected.reliability?.score as number | undefined) ?? 0
                }
              />
            </div>
            {selected.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selected.skills.map((s) => (
                  <Badge key={s} variant="default">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            {contributions && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Contributions
                </p>
                <div className="mt-2">
                  <JsonView data={contributions} />
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function ReliabilityBadge({ score }: { score: number }) {
  const variant = score >= 0.7 ? "success" : score >= 0.4 ? "warning" : "danger";
  return (
    <Badge variant={variant}>
      <Gauge size={11} /> {Math.round(score * 100)}%
    </Badge>
  );
}

// ── Projects tab ──────────────────────────────────────────────────────────

function ProjectsTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [projects, setProjects] = useState<kg.KgProject[]>([]);
  const [tasks, setTasks] = useState<kg.KgTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy, run } = useBusy();

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        kg.kgListProjects(workspaceId),
        kg.kgListTasks(workspaceId),
      ]);
      setProjects(p);
      setTasks(t);
    } catch {
      toast("Failed to load projects", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoAssign = async (taskId: string) => {
    const r = await run(() => kg.kgAutoAssignTask(workspaceId, taskId));
    if (r) {
      toast(`Assigned to ${r.assignee ?? "n/a"}`, "success");
      void load();
    } else {
      toast("Auto-assign failed", "error");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Target}>Projects</SectionTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {loading ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No projects in memory yet.
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-white/[.06] bg-white/[.02] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="default">{p.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.open_task_count} open / {p.task_count} total ·{" "}
                  {p.member_count} members
                </p>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={ListChecks}>Tasks</SectionTitle>
        <div className="mt-4 space-y-2">
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No tasks in memory yet.
            </p>
          ) : (
            tasks.map((t) => (
              <div
                key={t.task_id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.title ?? t.task_id}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {t.project} · {t.status}
                    {t.assignee ? ` · ${t.assignee}` : " · unassigned"}
                  </p>
                  {t.required_skills.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.required_skills.map((s) => (
                        <Badge key={s} variant="default">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {!t.assignee && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => autoAssign(t.task_id)}
                  >
                    Auto-assign
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Monitor tab ───────────────────────────────────────────────────────────

function MonitorTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [alerts, setAlerts] = useState<kg.KgAlert[]>([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  const load = async () => {
    setLoading(true);
    try {
      setAlerts(await kg.kgListAlerts(workspaceId, filter));
    } catch {
      toast("Failed to load alerts", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const doScan = async () => {
    const r = await run(() => kg.kgMonitorScan(workspaceId));
    if (r) {
      setScan(r);
      toast("Scan complete", "success");
      void load();
    } else {
      toast("Scan failed", "error");
    }
  };

  const ack = async (id: string) => {
    const r = await run(() => kg.kgAckAlert(workspaceId, id));
    if (r) {
      toast("Alert acknowledged", "success");
      void load();
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Activity}>Autonomous monitor</SectionTitle>
          <Button size="sm" variant="secondary" onClick={doScan} disabled={busy}>
            {busy ? <RefreshCw size={13} className="animate-spin" /> : <Activity size={13} />}
            Run scan
          </Button>
        </div>
        {scan && (
          <div className="mt-3">
            <JsonView data={scan} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={AlertTriangle}>Alerts</SectionTitle>
          <div className="flex gap-1">
            {["open", "acknowledged", "all"].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={
                  "rounded-lg px-2.5 py-1 text-xs transition " +
                  (filter === s
                    ? "bg-white/[.09] text-white"
                    : "text-zinc-500 hover:text-zinc-200")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {loading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : alerts.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No {filter} alerts.
            </p>
          ) : (
            alerts.map((a) => (
              <div
                key={a.alert_id}
                className="flex items-start gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
              >
                <Badge
                  variant={
                    a.severity === "high"
                      ? "danger"
                      : a.severity === "medium"
                        ? "warning"
                        : "default"
                  }
                >
                  {a.alert_type}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm text-zinc-200">{a.message}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {a.person ?? a.subject} · {a.project ?? "—"} ·{" "}
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                {a.status === "open" && (
                  <Button size="sm" variant="ghost" onClick={() => ack(a.alert_id)}>
                    <CheckCircle2 size={13} /> Ack
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Actions tab ───────────────────────────────────────────────────────────

function ActionsTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [actions, setActions] = useState<kg.KgAction[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const { busy, run } = useBusy();

  const load = async () => {
    setLoading(true);
    try {
      setActions(await kg.kgListActions(workspaceId, filter));
    } catch {
      toast("Failed to load actions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const complete = async (id: string) => {
    const r = await run(() => kg.kgCompleteAction(workspaceId, id));
    if (r) {
      toast("Action completed", "success");
      void load();
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <SectionTitle icon={ListChecks}>Suggested actions</SectionTitle>
        <div className="flex gap-1">
          {["pending", "completed", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                "rounded-lg px-2.5 py-1 text-xs transition " +
                (filter === s
                  ? "bg-white/[.09] text-white"
                  : "text-zinc-500 hover:text-zinc-200")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {loading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : actions.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-600">
            No {filter} actions.
          </p>
        ) : (
          actions.map((a) => (
            <div
              key={a.action_id}
              className="flex items-start gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"
            >
              <Badge
                variant={
                  a.urgency === "high"
                    ? "danger"
                    : a.urgency === "medium"
                      ? "warning"
                      : "default"
                }
              >
                {a.action}
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-200">{a.target}</p>
                <p className="mt-0.5 text-sm text-zinc-400">{a.message}</p>
              </div>
              {a.status === "pending" && (
                <Button size="sm" variant="ghost" onClick={() => complete(a.action_id)} disabled={busy}>
                  <CheckCircle2 size={13} /> Done
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// ── Planning tab ──────────────────────────────────────────────────────────

function PlanningTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [project, setProject] = useState("");
  const [prioritize, setPrioritize] = useState<Record<string, unknown>>();
  const [deps, setDeps] = useState<Record<string, unknown>>();
  const [scope, setScope] = useState<Record<string, unknown>>();
  const [estimation, setEstimation] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  const call = async (
    fn: () => Promise<Record<string, unknown>>,
    label: string,
  ) => {
    const r = await run(fn);
    if (r) toast(`${label} ready`, "success");
    else toast(`${label} failed`, "error");
    return r;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle icon={ListChecks}>Prioritize open tasks</SectionTitle>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Project (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => setPrioritize(await call(() => kg.kgPrioritize(workspaceId, project || undefined), "Prioritize"))}
          >
            Run
          </Button>
        </div>
        {prioritize && (
          <div className="mt-3">
            <JsonView data={prioritize} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={GitBranch}>Dependency analysis</SectionTitle>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Project (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => setDeps(await call(() => kg.kgDependencies(workspaceId, project || undefined), "Dependencies"))}
          >
            Run
          </Button>
        </div>
        {deps && (
          <div className="mt-3">
            <JsonView data={deps} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={TrendingUp}>Estimation accuracy</SectionTitle>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={busy}
          onClick={async () => setEstimation(await call(() => kg.kgEstimationAccuracy(workspaceId), "Estimation"))}
        >
          Run
        </Button>
        {estimation && (
          <div className="mt-3">
            <JsonView data={estimation} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={AlertTriangle}>Scope creep</SectionTitle>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Project name"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy || !project}
            onClick={async () => setScope(await call(() => kg.kgScopeCreep(workspaceId, project), "Scope creep"))}
          >
            Run
          </Button>
        </div>
        {scope && (
          <div className="mt-3">
            <JsonView data={scope} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Sprints tab ───────────────────────────────────────────────────────────

function SprintsTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [project, setProject] = useState("");
  const [sprints, setSprints] = useState<Record<string, unknown>[]>([]);
  const [roadmap, setRoadmap] = useState<Record<string, unknown>>();
  const [capacity, setCapacity] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle icon={Flag}>Sprints</SectionTitle>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Project (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const r = await run(() => kg.kgListSprints(workspaceId, project || undefined));
              if (r) setSprints(r);
            }}
          >
            Load
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {sprints.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-600">No sprints.</p>
          ) : (
            sprints.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[.06] bg-white/[.02] p-3 text-xs"
              >
                <JsonView data={s} />
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Target}>Roadmap</SectionTitle>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            const r = await run(() => kg.kgRoadmap(workspaceId, project || undefined));
            if (r) setRoadmap(r);
          }}
        >
          Load roadmap
        </Button>
        {roadmap && (
          <div className="mt-3">
            <JsonView data={roadmap} />
          </div>
        )}
      </Card>

      <Card className="p-5 lg:col-span-2">
        <SectionTitle icon={Gauge}>Capacity forecast</SectionTitle>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Project (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const r = await run(() => kg.kgCapacity(workspaceId, project || undefined));
              if (r) setCapacity(r);
            }}
          >
            Forecast
          </Button>
        </div>
        {capacity && (
          <div className="mt-3">
            <JsonView data={capacity} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Stakeholders tab ──────────────────────────────────────────────────────

function StakeholdersTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [audience, setAudience] = useState("investor");
  const [project, setProject] = useState("");
  const [update, setUpdate] = useState<Record<string, unknown>>();
  const [budget, setBudget] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle icon={MessageSquare}>Stakeholder update</SectionTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Tailored to the audience: investor, customer, team, or board.
        </p>
        <div className="mt-3 space-y-3">
          <Field label="Audience">
            <select
              className={inputClass}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="investor">Investor</option>
              <option value="customer">Customer</option>
              <option value="team">Team</option>
              <option value="board">Board</option>
            </select>
          </Field>
          <Field label="Project (optional)">
            <input
              className={inputClass}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </Field>
          <Button
            disabled={busy}
            onClick={async () => {
              const r = await run(() =>
                kg.kgStakeholderUpdate(workspaceId, {
                  stakeholder_type: audience,
                  project: project || undefined,
                }),
              );
              if (r) setUpdate(r);
            }}
          >
            <Send size={14} /> Generate
          </Button>
        </div>
        {update && (
          <div className="mt-3">
            <JsonView data={update} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={DollarSign}>Budget status</SectionTitle>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Project (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const r = await run(() => kg.kgBudgetStatus(workspaceId, project || undefined));
              if (r) setBudget(r);
            }}
          >
            Load
          </Button>
        </div>
        {budget && (
          <div className="mt-3">
            <JsonView data={budget} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Team tab ──────────────────────────────────────────────────────────────

function TeamTab({
  workspaceId,
  toast,
}: {
  workspaceId: string;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [engineer, setEngineer] = useState("");
  const [feedback, setFeedback] = useState<Record<string, unknown>>();
  const [morale, setMorale] = useState<Record<string, unknown>>();
  const { busy, run } = useBusy();

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle icon={Users}>Performance feedback</SectionTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Honest, specific feedback based on contribution data and reliability.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Engineer name"
            value={engineer}
            onChange={(e) => setEngineer(e.target.value)}
          />
          <Button
            disabled={busy || !engineer}
            onClick={async () => {
              const r = await run(() => kg.kgPerformanceFeedback(workspaceId, engineer));
              if (r) setFeedback(r);
            }}
          >
            Generate
          </Button>
        </div>
        {feedback && (
          <div className="mt-3">
            <JsonView data={feedback} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Lightbulb}>Team morale</SectionTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Sentiment trends over the last 14 days. Detects declining morale.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            const r = await run(() => kg.kgTeamMorale(workspaceId));
            if (r) setMorale(r);
          }}
        >
          <Bell size={14} /> Sense morale
        </Button>
        {morale && (
          <div className="mt-3">
            <JsonView data={morale} />
          </div>
        )}
      </Card>
    </div>
  );
}
