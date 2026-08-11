"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Check,
  Github,
  Key,
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
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Integration } from "@/lib/types";

const PROVIDERS = [
  "github",
  "slack",
  "google_calendar",
  "microsoft_calendar",
  "jira",
  "linear",
  "notion",
] as const;

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
  const [kgmemoryOpen, setKgmemoryOpen] = useState(false);

  const integrations = q.data ?? [];

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
          return (
            <Card key={provider} className="p-5">
              <div className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.07]">
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
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {connected
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

        {/* kgmemory card */}
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
                  : "Optional — adds engineer reliability scoring"}
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
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!workspaceId || !me}
                  onClick={() => setKgmemoryOpen(true)}
                >
                  <Key size={13} /> Connect
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* kgmemory connect dialog */}
      <KgMemoryDialog
        open={kgmemoryOpen}
        onClose={() => setKgmemoryOpen(false)}
        workspaceId={workspaceId}
        onSuccess={async () => {
          await q.reload();
          setKgmemoryOpen(false);
        }}
      />
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

function KgMemoryDialog({
  open,
  onClose,
  workspaceId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onSuccess: () => Promise<void>;
}) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || !apiKey) return;
    setPending(true);
    try {
      await api("/integrations/kgmemory/connect", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: workspaceId,
          api_key: apiKey,
          base_url: baseUrl || undefined,
        }),
      });
      toast("Knowledge Graph Memory connected", "success");
      setApiKey("");
      setBaseUrl("");
      await onSuccess();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Connection failed", "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect Knowledge Graph Memory"
      description="Enter your kgmemory API key. Keys are issued via the kgmemory dashboard."
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-xs text-zinc-400">
          API key
          <input
            required
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
            placeholder="kg_live_..."
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Base URL (optional)
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
            placeholder="https://api.kgmemory.com"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!workspaceId || pending}>
            {pending ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
