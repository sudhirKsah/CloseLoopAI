"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace-provider";
import { useAuth } from "@/components/auth-provider";
import { useSubscription } from "@/components/subscription-provider";
const links = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["Meetings", "/meetings", CalendarDays],
  ["Tasks", "/tasks", CheckSquare],
  ["Approvals", "/approvals", ShieldCheck],
  ["People", "/people", Users],
  ["Analytics", "/analytics", Activity],
  ["Integrations", "/integrations", Link2],
  ["PM Memory", "/memory", Sparkles],
  ["Reports", "/reports", FileBarChart],
  ["Payments", "/payments", CreditCard],
  ["Settings", "/settings", Settings],
] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    [open, setOpen] = useState(false),
    { me, workspace, selectWorkspace } = useWorkspace(),
    { logout } = useAuth(),
    { sub } = useSubscription();
  const allLinks = sub?.is_platform_admin
    ? [...links, ["Admin", "/admin", ShieldCheck] as const]
    : links;
  const nav = (
    <nav className="space-y-1">
      {allLinks.map(([label, href, Icon]) => (
        <Link
          onClick={() => setOpen(false)}
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-[background-color,color] duration-150 ease-out active:scale-[0.98]",
            path === href
              ? "bg-white/[.09] text-white"
              : "text-zinc-500 hover:bg-white/[.045] hover:text-zinc-200",
          )}
        >
          <Icon size={17} />
          {label}
        </Link>
      ))}
    </nav>
  );
  const initials = (me?.name ?? "?")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2);
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <aside
        className={cn(
          "fixed inset-y-0 z-40 w-[250px] border-r border-white/[.08] bg-[#0d0d10] p-4 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-semibold"
          >
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">
              P
            </span>
            Pathayo
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-8">{nav}</div>
        <div className="absolute bottom-5 left-4 right-4 rounded-2xl border border-white/[.08] bg-white/[.035] p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-orange-300 text-[10px] font-bold">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {me?.name ?? "Loading account"}
              </p>
              <p className="truncate text-[10px] text-zinc-500">
                {workspace?.name ?? "No workspace"}
              </p>
            </div>
            <button
              onClick={logout}
              aria-label="Log out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[.08] hover:text-rose-300 active:scale-95"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <main className="lg:ml-[250px]">
        <header className="flex h-[70px] items-center justify-between border-b border-white/[.08] px-5 lg:px-8">
          <button
            className="text-zinc-400 transition active:scale-95 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
          <WorkspaceSwitcher
            workspaces={me?.workspaces ?? []}
            activeId={workspace?.id ?? ""}
            onSelect={selectWorkspace}
          />
          <div className="ml-auto flex items-center gap-3">
            <TrialBadge />
            <Link
              href="/settings"
              className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300 text-zinc-950 transition active:scale-95"
            >
              <Settings size={16} />
            </Link>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function TrialBadge() {
  const { sub } = useSubscription();
  if (!sub || sub.is_platform_admin) return null;
  // Hide badge for lifetime or long-paid plans
  if (sub.plan === "lifetime") return null;
  if ((sub.plan === "yearly" || sub.plan === "monthly") && sub.days_remaining > 30)
    return null;
  const days = sub.days_remaining;
  const isExpired = !sub.allowed;
  const isUrgent = days <= 2 && !isExpired;
  return (
    <Link
      href="/payments"
      className={`hidden rounded-lg border px-2.5 py-1.5 text-xs font-medium transition sm:block ${
        isExpired
          ? "border-red-400/30 bg-red-400/10 text-red-300"
          : isUrgent
            ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
            : "border-white/[.08] bg-white/[.04] text-zinc-400"
      }`}
    >
      {isExpired
        ? "Trial ended — Subscribe"
        : days === 0
          ? "Trial ends today"
          : `${days} day${days === 1 ? "" : "s"} left`}
    </Link>
  );
}

function WorkspaceSwitcher({
  workspaces,
  activeId,
  onSelect,
}: {
  workspaces: { id: string; name: string; role: string }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = workspaces.find((w) => w.id === activeId);
  if (workspaces.length === 0)
    return (
      <span className="hidden text-sm text-zinc-600 lg:block">
        No workspace
      </span>
    );
  return (
    <div className="relative hidden lg:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-[#111116] px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/[.06] active:scale-[0.97]"
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-emerald-300/15 text-[10px] font-bold text-emerald-300">
          {(active?.name ?? "W")[0]}
        </span>
        <span className="max-w-[160px] truncate">{active?.name ?? "Select"}</span>
        <ChevronDown
          size={14}
          className={cn(
            "text-zinc-500 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close switcher"
          />
          <div className="absolute left-0 top-full z-40 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-white/[.08] bg-[#15151a] p-1 shadow-2xl animate-[dialog-panel-in_160ms_ease-out]">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  onSelect(w.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition active:scale-[0.98]",
                  w.id === activeId
                    ? "bg-white/[.08] text-white"
                    : "text-zinc-400 hover:bg-white/[.04] hover:text-zinc-200",
                )}
              >
                <span className="grid h-5 w-5 place-items-center rounded-md bg-emerald-300/15 text-[10px] font-bold text-emerald-300">
                  {w.name[0]}
                </span>
                <span className="flex-1 truncate">{w.name}</span>
                <span className="text-[10px] text-zinc-600">{w.role}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
