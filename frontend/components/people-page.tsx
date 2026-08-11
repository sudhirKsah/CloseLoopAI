"use client";

import { useRef, useState } from "react";
import {
  Download,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useWorkspace } from "@/components/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Member, SyncResult } from "@/lib/types";

const field =
  "mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60";

export function PeoplePage() {
  const { workspaceId, me } = useWorkspace();
  const toast = useToast();
  const q = useApi<Member[]>(
    workspaceId ? `/workspaces/${workspaceId}/members` : "",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const members = q.data ?? [];

  const syncSlack = async () => {
    setBusy("slack-sync");
    try {
      const result = await api<SyncResult>(
        `/workspaces/${workspaceId}/members/sync/slack`,
        { method: "POST" },
      );
      toast(`Synced ${result.synced ?? 0} people from Slack`, "success");
      await q.reload();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Slack sync failed",
        "error",
      );
    } finally {
      setBusy(undefined);
    }
  };

  const downloadTemplate = async () => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
      const token = window.localStorage.getItem("closeloop_token");
      const res = await fetch(
        `${baseUrl}/workspaces/${workspaceId}/members/template`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "members-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Failed to download template", "error");
    }
  };

  const importCsv = async (file: File) => {
    setBusy("import");
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
      const token = window.localStorage.getItem("closeloop_token");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${baseUrl}/workspaces/${workspaceId}/members/import`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Import failed: ${res.status}`);
      }
      const result = await res.json();
      toast(
        `Imported ${result.imported} members` +
          (result.skipped ? `, ${result.skipped} skipped` : ""),
        result.skipped > 0 ? "info" : "success",
      );
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Import failed", "error");
    } finally {
      setBusy(undefined);
    }
  };

  const removeMember = async (member: Member) => {
    if (!confirm(`Remove ${member.name} from this workspace?`)) return;
    setBusy(`remove-${member.id}`);
    try {
      await api(`/workspaces/${workspaceId}/members/${member.id}`, {
        method: "DELETE",
      });
      toast(`${member.name} removed`, "success");
      await q.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to remove", "error");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <main className="p-5 lg:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[.16em] text-emerald-300">
            PEOPLE
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            Team directory.
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Manage members, import via CSV, or sync from Slack.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy === "slack-sync" || !workspaceId}
            onClick={() => syncSlack()}
          >
            <RefreshCw size={14} />
            {busy === "slack-sync" ? "Syncing…" : "Sync Slack"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!workspaceId}
            onClick={() => downloadTemplate()}
          >
            <Download size={14} /> Template
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy === "import" || !workspaceId}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} />
            {busy === "import" ? "Importing…" : "Import CSV"}
          </Button>
          <Button size="sm" disabled={!workspaceId} onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add member
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importCsv(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {q.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : q.error ? (
        <Card className="border-amber-300/20 p-8 text-sm text-amber-100">
          <p className="font-medium">Unable to load members</p>
          <p className="mt-2 text-zinc-500">{q.error}</p>
        </Card>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="No team members yet"
          description="Add members manually, import a CSV, or sync from Slack to start tracking who owns what."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/30 to-orange-300/30 text-xs font-bold">
                  {m.name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {m.title ?? "No title"} · {m.department ?? "Unassigned"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={m.dashboard_access ? "success" : "default"}>
                      {m.dashboard_access ? "Dashboard access" : "Directory only"}
                    </Badge>
                    <Badge variant="info">{m.role}</Badge>
                  </div>
                  {m.email && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600">
                      <Mail size={11} /> {m.email}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditMember(m)}
                >
                  <UserCog size={13} /> Edit
                </Button>
                {me?.id !== m.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `remove-${m.id}`}
                    onClick={() => removeMember(m)}
                  >
                    <Trash2 size={13} />
                    {busy === `remove-${m.id}` ? "…" : "Remove"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add member dialog */}
      <MemberDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        workspaceId={workspaceId}
        onSuccess={async () => {
          await q.reload();
          setAddOpen(false);
        }}
      />

      {/* Edit member dialog */}
      <MemberDialog
        open={!!editMember}
        member={editMember}
        onClose={() => setEditMember(null)}
        workspaceId={workspaceId}
        onSuccess={async () => {
          await q.reload();
          setEditMember(null);
        }}
      />
    </main>
  );
}

function MemberDialog({
  open,
  onClose,
  workspaceId,
  member,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  member?: Member | null;
  onSuccess: () => Promise<void>;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const isEdit = !!member;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    try {
      const body = {
        name: form.get("name"),
        email: form.get("email") || undefined,
        title: form.get("title") || undefined,
        department: form.get("department") || undefined,
        role: form.get("role") || "member",
        skills: (form.get("skills") as string)
          ?.split(/[;\n]/)
          .map((s) => s.trim())
          .filter(Boolean) ?? [],
        aliases: (form.get("aliases") as string)
          ?.split(/[;\n]/)
          .map((s) => s.trim())
          .filter(Boolean) ?? [],
      };
      if (isEdit && member) {
        await api(`/workspaces/${workspaceId}/members/${member.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast("Member updated", "success");
      } else {
        await api(`/workspaces/${workspaceId}/members`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast("Member added", "success");
      }
      (e.target as HTMLFormElement).reset();
      await onSuccess();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save", "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit member" : "Add member"}
      description={
        isEdit
          ? "Update directory information for this member."
          : "Add a person to your workspace directory."
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-xs text-zinc-400">
          Name
          <input
            required
            name="name"
            defaultValue={member?.name ?? ""}
            className={field}
            placeholder="Jane Doe"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Email
            <input
              name="email"
              type="email"
              defaultValue={member?.email ?? ""}
              className={field}
              placeholder="jane@company.com"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Title
            <input
              name="title"
              defaultValue={member?.title ?? ""}
              className={field}
              placeholder="Senior Engineer"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Department
            <input
              name="department"
              defaultValue={member?.department ?? ""}
              className={field}
              placeholder="Platform"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Role
            <select name="role" defaultValue={member?.role ?? "member"} className={field}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        </div>
        <label className="block text-xs text-zinc-400">
          Skills (semicolon-separated)
          <input
            name="skills"
            defaultValue={member?.skills?.join("; ") ?? ""}
            className={field}
            placeholder="python; postgres; react"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Aliases (semicolon-separated)
          <input
            name="aliases"
            defaultValue={member?.aliases?.join("; ") ?? ""}
            className={field}
            placeholder="jane; j.doe"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!workspaceId || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add member"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
