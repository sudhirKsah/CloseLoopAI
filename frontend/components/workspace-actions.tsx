"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/components/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const field =
  "mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60";

export function MeetingCreateDialog({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}) {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await api("/recall/bots", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: workspaceId,
          meeting_url: form.get("meeting_url"),
          title: form.get("title") || undefined,
          join_at: form.get("join_at") || undefined,
        }),
      });
      toast("Meeting bot dispatched", "success");
      await onCreated();
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add meeting", "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add a meeting"
        description="Pathayo will send its CloseLoop agent to the meeting link."
      >
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-xs text-zinc-400">
            Meeting title
            <input
              name="title"
              className={field}
              placeholder="Weekly product review"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Meet, Zoom, Teams, or Slack Huddle URL
            <input
              required
              name="meeting_url"
              type="url"
              className={field}
              placeholder="https://meet.google.com/..."
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Join time (optional)
            <input name="join_at" type="datetime-local" className={field} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!workspaceId || pending}>
              {pending ? "Adding…" : "Add meeting"}
            </Button>
          </div>
        </form>
      </Dialog>
      <Button onClick={() => setOpen(true)} disabled={!workspaceId}>
        <Plus size={15} />
        Add meeting
      </Button>
    </>
  );
}

export function TaskCreateDialog({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}) {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await api(`/workspaces/${workspaceId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description") || undefined,
          priority: Number(form.get("priority")),
        }),
      });
      toast("Task created", "success");
      await onCreated();
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create task", "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create internal task"
        description="Use this for work not created from a meeting extraction."
      >
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-xs text-zinc-400">
            Task title
            <input
              required
              name="title"
              className={field}
              placeholder="Prepare launch brief"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Description
            <textarea
              name="description"
              className={`${field} h-24 py-3`}
              placeholder="What does done look like?"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Priority
            <select name="priority" defaultValue="3" className={field}>
              <option value="1">Critical</option>
              <option value="2">High</option>
              <option value="3">Normal</option>
              <option value="4">Low</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!workspaceId || pending}>
              {pending ? "Creating…" : "Create task"}
            </Button>
          </div>
        </form>
      </Dialog>
      <Button onClick={() => setOpen(true)} disabled={!workspaceId}>
        <Plus size={15} />
        Create task
      </Button>
    </>
  );
}
