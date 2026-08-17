"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Crown,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Shield,
  Users,
  Building2,
  Mail,
  CreditCard,
  Send,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSubscription } from "@/components/subscription-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  is_platform_admin: boolean;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string | null;
};

type WorkspaceRow = {
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  owner_name: string | null;
  member_count: number;
  plan: string;
  status: string;
  trial_end: string | null;
  paid_until: string | null;
  days_remaining: number;
  is_active: boolean;
};

type PaymentRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  created_at: string | null;
};

type PaymentSummary = {
  total_revenue_paise: number;
  total_revenue_display: string;
  status_counts: Record<string, number>;
  method_counts: { method: string; count: number; amount_paise: number }[];
};

export function AdminPage() {
  const { sub } = useSubscription();
  const toast = useToast();
  const [tab, setTab] = useState<"workspaces" | "users" | "payments" | "email">("workspaces");
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [wsRes, userRes] = await Promise.all([
        api<{ total: number; workspaces: WorkspaceRow[] }>("/admin/workspaces"),
        api<{ total: number; users: UserRow[] }>("/admin/users"),
      ]);
      setWorkspaces(wsRes.workspaces);
      setUsers(userRes.users);
      // Load payments only when on payments tab (lazy load)
      if (tab === "payments") {
        const [payRes, sumRes] = await Promise.all([
          api<{ total: number; payments: PaymentRow[] }>("/admin/payments"),
          api<PaymentSummary>("/admin/payments/summary"),
        ]);
        setPayments(payRes.payments);
        setPaymentSummary(sumRes);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load admin data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast, tab]);

  useEffect(() => {
    if (sub?.is_platform_admin) void reload();
  }, [sub?.is_platform_admin, reload]);

  const action = async (id: string, fn: () => Promise<unknown>, label: string) => {
    setBusy(id + label);
    try {
      await fn();
      toast(label + " succeeded", "success");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : label + " failed", "error");
    } finally {
      setBusy(undefined);
    }
  };

  if (!sub?.is_platform_admin) {
    return (
      <main className="p-5 lg:p-8">
        <Card className="border-amber-300/20 p-8 text-sm text-amber-100">
          <p className="font-medium">Admin access required</p>
          <p className="mt-2 text-zinc-500">
            You need platform admin privileges to view this page.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="p-5 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium tracking-[.16em] text-emerald-300">
            <Shield size={12} /> ADMIN PANEL
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            Platform administration
          </h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => reload()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setTab("workspaces")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "workspaces"
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <Building2 size={14} className="mr-1.5 inline" />
          Workspaces ({workspaces.length})
        </button>
        <button
          onClick={() => setTab("users")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "users"
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <Users size={14} className="mr-1.5 inline" />
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab("payments")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "payments"
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <CreditCard size={14} className="mr-1.5 inline" />
          Payments
        </button>
        <button
          onClick={() => setTab("email")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "email"
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <Mail size={14} className="mr-1.5 inline" />
          Email
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : tab === "workspaces" ? (
          <WorkspaceTable
            workspaces={workspaces}
            busy={busy}
            onExtend={(id, days) =>
              action(id, () =>
                api(`/admin/workspaces/${id}/extend-trial`, {
                  method: "POST",
                  body: JSON.stringify({ days }),
                }),
                `Extended trial by ${days} days`,
              )
            }
            onGrantLifetime={(id) =>
              action(id, () =>
                api(`/admin/workspaces/${id}/grant-plan`, {
                  method: "POST",
                  body: JSON.stringify({ plan: "lifetime" }),
                }),
                "Granted lifetime access",
              )
            }
            onGrantMonthly={(id) =>
              action(id, () =>
                api(`/admin/workspaces/${id}/grant-plan`, {
                  method: "POST",
                  body: JSON.stringify({ plan: "monthly", days: 30 }),
                }),
                "Granted monthly plan (30 days)",
              )
            }
            onGrantYearly={(id) =>
              action(id, () =>
                api(`/admin/workspaces/${id}/grant-plan`, {
                  method: "POST",
                  body: JSON.stringify({ plan: "yearly", days: 365 }),
                }),
                "Granted yearly plan (365 days)",
              )
            }
            onRevoke={(id) =>
              action(id, () =>
                api(`/admin/workspaces/${id}/revoke`, { method: "POST" }),
                "Revoked access",
              )
            }
          />
        ) : tab === "users" ? (
          <UserTable
            users={users}
            busy={busy}
            onToggleAdmin={(id) =>
              action(id, () =>
                api(`/admin/users/${id}/toggle-admin`, { method: "POST" }),
                "Toggled admin",
              )
            }
            onToggleActive={(id) =>
              action(id, () =>
                api(`/admin/users/${id}/toggle-active`, { method: "POST" }),
                "Toggled active",
              )
            }
          />
        ) : tab === "payments" ? (
          <PaymentsTab payments={payments} summary={paymentSummary} loading={loading} />
        ) : (
          <EmailTab
            users={users}
            onSend={(to, subject, body) =>
              action("email", () =>
                api("/admin/send-email", {
                  method: "POST",
                  body: JSON.stringify({ to, subject, body }),
                }),
                `Email sent to ${to}`,
              )
            }
            onBroadcast={(subject, body) =>
              action("broadcast", () =>
                api("/admin/broadcast-email", {
                  method: "POST",
                  body: JSON.stringify({ subject, body, only_active: true }),
                }),
                "Broadcast sent",
              )
            }
          />
        )}
      </div>
    </main>
  );
}

// ── Workspace Table ──────────────────────────────────────────────────────────

function WorkspaceTable({
  workspaces,
  busy,
  onExtend,
  onGrantLifetime,
  onGrantMonthly,
  onGrantYearly,
  onRevoke,
}: {
  workspaces: WorkspaceRow[];
  busy?: string;
  onExtend: (id: string, days: number) => void;
  onGrantLifetime: (id: string) => void;
  onGrantMonthly: (id: string) => void;
  onGrantYearly: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {workspaces.map((ws) => {
        const isBusy = busy?.startsWith(ws.workspace_id);
        return (
          <Card key={ws.workspace_id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{ws.workspace_name}</p>
                  <PlanBadge plan={ws.plan} status={ws.status} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {ws.owner_email ?? "Unknown owner"} · {ws.member_count} member
                  {ws.member_count === 1 ? "" : "s"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {ws.plan === "trial"
                    ? `Trial: ${ws.days_remaining} day${ws.days_remaining === 1 ? "" : "s"} remaining`
                    : ws.plan === "lifetime"
                      ? "Lifetime access"
                      : ws.paid_until
                        ? `Paid until ${new Date(ws.paid_until).toLocaleDateString()}`
                        : "No active subscription"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => onExtend(ws.workspace_id, 7)}
                >
                  <Clock size={12} /> +7 days
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => onGrantMonthly(ws.workspace_id)}
                >
                  +Monthly
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => onGrantYearly(ws.workspace_id)}
                >
                  +Yearly
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => onGrantLifetime(ws.workspace_id)}
                >
                  <Crown size={12} /> Lifetime
                </Button>
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() => onRevoke(ws.workspace_id)}
                  className="bg-red-500/20 text-red-300 hover:bg-red-500/30"
                >
                  Revoke
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
      {workspaces.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-600">No workspaces yet.</p>
      )}
    </div>
  );
}

// ── User Table ───────────────────────────────────────────────────────────────

function UserTable({
  users,
  busy,
  onToggleAdmin,
  onToggleActive,
}: {
  users: UserRow[];
  busy?: string;
  onToggleAdmin: (id: string) => void;
  onToggleActive: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {users.map((u) => {
        const isBusy = busy?.startsWith(u.id);
        return (
          <Card key={u.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{u.display_name}</p>
                  {u.is_platform_admin && (
                    <Badge variant="info">
                      <Shield size={10} /> Admin
                    </Badge>
                  )}
                  {u.is_active ? (
                    <Badge variant="success">
                      <CheckCircle2 size={10} /> Active
                    </Badge>
                  ) : (
                    <Badge variant="danger">
                      <XCircle size={10} /> Disabled
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {u.email}
                  {u.created_at && ` · joined ${new Date(u.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => onToggleAdmin(u.id)}
                >
                  {u.is_platform_admin ? "Remove admin" : "Make admin"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => onToggleActive(u.id)}
                >
                  {u.is_active ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
      {users.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-600">No users yet.</p>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PlanBadge({ plan, status }: { plan: string; status: string }) {
  if (status === "canceled")
    return <Badge variant="danger">Canceled</Badge>;
  if (plan === "lifetime")
    return <Badge variant="info"><Crown size={10} /> Lifetime</Badge>;
  if (plan === "yearly")
    return <Badge variant="success">Yearly</Badge>;
  if (plan === "monthly")
    return <Badge variant="success">Monthly</Badge>;
  if (plan === "expired" || status === "expired")
    return <Badge variant="danger">Expired</Badge>;
  return <Badge variant="info">Trial</Badge>;
}

// ── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsTab({
  payments,
  summary,
  loading,
}: {
  payments: PaymentRow[];
  summary: PaymentSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs text-zinc-500">Total Revenue</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <TrendingUp size={18} className="text-emerald-300" />
              {summary.total_revenue_display}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-zinc-500">Payment Status</p>
            <div className="mt-2 space-y-1">
              {Object.entries(summary.status_counts).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">{status}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(summary.status_counts).length === 0 && (
                <p className="text-sm text-zinc-600">No payments yet</p>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-zinc-500">Payment Methods</p>
            <div className="mt-2 space-y-1">
              {summary.method_counts.map((m) => (
                <div key={m.method} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">{m.method}</span>
                  <span className="font-medium">
                    {m.count} · ₹{(m.amount_paise / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
              {summary.method_counts.length === 0 && (
                <p className="text-sm text-zinc-600">No captured payments</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Payment list */}
      <div className="space-y-2">
        {payments.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{p.workspace_name}</p>
                  <Badge variant={p.status === "captured" ? "success" : "danger"}>
                    {p.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.method ?? "—"} · {p.razorpay_payment_id}
                  {p.created_at && ` · ${new Date(p.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <p className="text-lg font-semibold">
                {p.currency === "INR" ? "₹" : p.currency}
                {(p.amount / 100).toLocaleString()}
              </p>
            </div>
          </Card>
        ))}
        {payments.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-600">No payments yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Email Tab ────────────────────────────────────────────────────────────────

function EmailTab({
  users,
  onSend,
  onBroadcast,
}: {
  users: UserRow[];
  onSend: (to: string, subject: string, body: string) => void;
  onBroadcast: (subject: string, body: string) => void;
}) {
  const [mode, setMode] = useState<"single" | "broadcast">("single");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    if (mode === "single") {
      if (!to.trim()) return;
      onSend(to.trim(), subject.trim(), body);
    } else {
      onBroadcast(subject.trim(), body);
    }
    setSubject("");
    setBody("");
    setTo("");
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("single")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            mode === "single"
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <Mail size={14} className="mr-1.5 inline" />
          Single email
        </button>
        <button
          onClick={() => setMode("broadcast")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            mode === "broadcast"
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <Send size={14} className="mr-1.5 inline" />
          Broadcast to all ({users.filter((u) => u.is_active).length} active)
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "single" && (
          <div>
            <label className="mb-1.5 block text-xs text-zinc-500">Recipient email</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/30"
              required
            />
            {/* Quick-pick from user list */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {users.slice(0, 8).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setTo(u.email)}
                  className="rounded-lg border border-white/[.06] bg-white/[.03] px-2 py-1 text-xs text-zinc-400 transition hover:text-zinc-200"
                >
                  {u.email}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            maxLength={200}
            className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/30"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">
            Body {mode === "broadcast" && "(sent to all active users)"}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email here… (HTML allowed)"
            rows={8}
            maxLength={10000}
            className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/30"
            required
          />
        </div>
        {mode === "broadcast" && (
          <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">
            This will send an email to all active users. Use with caution.
          </p>
        )}
        <Button type="submit" size="lg" variant="primary">
          <Send size={14} />
          {mode === "single" ? "Send email" : `Broadcast to ${users.filter((u) => u.is_active).length} users`}
        </Button>
      </form>
    </div>
  );
}
