"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Check,
  Github,
  Link2,
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
import { Skeleton } from "@/components/ui/skeleton";
import * as kg from "@/lib/kgmemory";
import type { Integration } from "@/lib/types";

const PROVIDERS = [
  "github",
  "slack",
  "jira",
  "linear",
  "google_calendar",
  "microsoft_calendar",
  "notion",
] as const;

const COMING_SOON: ReadonlySet<string> = new Set([
  "google_calendar",
  "microsoft_calendar",
  "notion",
]);

const PROVIDER_LABELS: Record<string, string> = {
  google_calendar: "Google Calendar",
  microsoft_calendar: "Microsoft Calendar",
};

function label(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider.replaceAll("_", " ");
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "github") return <Github size={18} />;
  if (provider === "slack") return <Slack size={18} />;
  if (provider.includes("calendar")) return <Calendar size={18} />;
  return <Link2 size={18} />;
}

export function IntegrationsPage() {
  const { workspaceId, me } = useWorkspace();
  const toast = useToast();
  const q = useApi<Integration[]>(
    workspaceId ? `/workspaces/${workspaceId}/integrations` : "",
  );
  const [busy, setBusy] = useState<string>();

  const integrations = q.data ?? [];

  // kgmemory is auto-provisioned server-side: hitting /status ensures a
  // dedicated org + API key exists for this workspace, then we reload the
  // integrations list so the card reflects the freshly-created connection.
  useEffect(() => {
    if (!workspaceId) return;
    kg
      .kgStatus(workspaceId)
      .then(() => q.reload())
      .catch(() => {
        /* surfaced via the card status, not a toast */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const connect = async (provider: string) => {
    if (!workspaceId || !me) return;
    setBusy(provider);
    try {
      const result = await api<{ authorization_url: string }>(
        `/integrations/${provider}/connect?workspace_id=${workspaceId}&user_id=${me.id}&redirect_uri=${encodeURIComponent(`${window.location.origin}/integrations`)}`,
      );
      window.location.assign(result.authorization_url);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Connection failed", "error");
    } finally {
      setBusy(undefined);
    }
  };

  const kgmemoryIntegration = integrations.find((i) => i.provider === "kgmemory");

  if (q.loading) {
    return (
      <IntegrationsLayout>
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((p) => (
            <Skeleton key={p} className="h-24 rounded-2xl" />
          ))}
        </div>
      </IntegrationsLayout>
    );
  }

  if (q.error) {
    return (
      <IntegrationsLayout>
        <Card className="border-amber-300/20 p-8 text-sm text-amber-100">
          <p className="font-medium">Unable to load integrations</p>
          <p className="mt-2 text-zinc-500">{q.error}</p>
        </Card>
      </IntegrationsLayout>
    );
  }

  return (
    <IntegrationsLayout>
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const item = integrations.find((x) => x.provider === provider);
          const connected = item?.state === "connected";
          const comingSoon = COMING_SOON.has(provider);
          return (
            <Card
              key={provider}
              className={`p-5 ${comingSoon ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    comingSoon ? "bg-white/[.04] text-zinc-500" : "bg-white/[.07]"
                  }`}
                >
                  <ProviderIcon provider={provider} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize">{label(provider)}</p>
                    {connected && (
                      <Badge variant="success">
                        <Check size={11} /> Connected
                      </Badge>
                    )}
                    {comingSoon && !connected && (
                      <Badge variant="info">Coming soon</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {comingSoon && !connected
                      ? "Integration is on the roadmap and not available yet."
                      : connected
                        ? item?.last_synced_at
                          ? `Last synced ${new Date(item.last_synced_at).toLocaleDateString()}`
                          : "Connected and ready"
                        : "Not connected"}
                  </p>

                  {connected && item && (
                    <Link
                      href={`/integrations/${item.id}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-200"
                    >
                      View details
                      <ArrowRight size={12} />
                    </Link>
                  )}
                </div>

                <div className="shrink-0">
                  {connected ? (
                    <Link href={`/integrations/${item!.id}`}>
                      <Button size="sm" variant="secondary">
                        Manage
                      </Button>
                    </Link>
                  ) : comingSoon ? (
                    <Button size="sm" disabled>
                      Coming soon
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy === provider || !me}
                      onClick={() => connect(provider)}
                    >
                      {busy === provider ? "Opening…" : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {/* kgmemory card — auto-provisioned, no API key entry required */}
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
              <Zap size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Knowledge Graph Memory</p>
                {kgmemoryIntegration?.state === "connected" && (
                  <Badge variant="success">
                    <Check size={11} /> Connected
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {kgmemoryIntegration?.state === "connected"
                  ? "Reliability scores and meeting memory active"
                  : "Connecting… a dedicated memory graph is being provisioned for this workspace."}
              </p>
              {kgmemoryIntegration?.state === "connected" && (
                <Link
                  href={`/integrations/${kgmemoryIntegration.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-200"
                >
                  View details
                  <ArrowRight size={12} />
                </Link>
              )}
            </div>
            <div className="shrink-0">
              {kgmemoryIntegration?.state === "connected" ? (
                <Link href={`/integrations/${kgmemoryIntegration.id}`}>
                  <Button size="sm" variant="secondary">
                    Manage
                  </Button>
                </Link>
              ) : (
                <Badge variant="info">Automatic</Badge>
              )}
            </div>
          </div>
        </Card>
      </div>
    </IntegrationsLayout>
  );
}

function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="p-5 lg:p-8">
      <p className="text-[11px] font-medium tracking-[.16em] text-emerald-300">
        INTEGRATIONS
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
        Your execution signal layer.
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Connect only the tools your team uses.
      </p>
      <div className="mt-7">{children}</div>
    </main>
  );
}
