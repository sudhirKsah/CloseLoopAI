"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useWorkspace } from "@/components/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: Record<string, unknown>;
  action: Record<string, unknown>;
};
export function EscalationRules() {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const q = useApi<Rule[]>(
    workspaceId ? `/execution/workspaces/${workspaceId}/escalation-rules` : "",
  );
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const days = Number(form.get("days"));
      const target = String(form.get("target"));
      await api(`/execution/workspaces/${workspaceId}/escalation-rules`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          priority: Number(form.get("priority")),
          conditions: { inactive_days: { gte: days } },
          action:
            target === "slack"
              ? { type: "reminder", channel: "slack" }
              : {
                  type: "escalate",
                  target,
                  level: target === "manager" ? 2 : 3,
                },
        }),
      });
      toast("Escalation rule created", "success");
      event.currentTarget.reset();
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create rule", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="p-5 lg:p-8">
      <p className="text-xs font-medium tracking-[.16em] text-emerald-300">
        AUTOMATION
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Escalation rules</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Configure the conditions under which CloseLoop nudges or escalates. No
        team member gains dashboard access through a rule.
      </p>
      <Card className="mt-7 max-w-2xl p-5">
        <p className="font-medium">New rule</p>
        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">
            Rule name
            <input
              required
              name="name"
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white"
              placeholder="Escalate stale launch work"
            />
          </label>
          <label className="text-xs text-zinc-400">
            No progress for
            <input
              required
              name="days"
              type="number"
              min="1"
              defaultValue="3"
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Action target
            <select
              name="target"
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white"
            >
              <option value="slack">Slack reminder</option>
              <option value="manager">Manager escalation</option>
              <option value="founder">Founder escalation</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Priority
            <input
              required
              name="priority"
              type="number"
              min="1"
              defaultValue="100"
              className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white"
            />
          </label>
          <Button className="sm:col-span-2" disabled={!workspaceId || saving}>
            {saving ? "Saving…" : "Create rule"}
          </Button>
        </form>
      </Card>
      <div className="mt-5 grid gap-3">
        {q.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : q.error ? (
          <Card className="border-amber-300/20 p-5 text-sm text-amber-100">
            Unable to load rules: {q.error}
          </Card>
        ) : q.data?.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle size={24} />}
            title="No escalation rules yet"
            description="Create rules to get Slack alerts when tasks stall. For example: no activity for 3 days → remind owner, 5 days → escalate to manager."
          />
        ) : (
          q.data?.map((rule) => (
            <Card key={rule.id} className="p-5">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Priority {rule.priority} ·{" "}
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <pre className="max-w-[50%] whitespace-pre-wrap text-right text-xs text-zinc-500">
                  {JSON.stringify({ when: rule.conditions, then: rule.action })}
                </pre>
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
