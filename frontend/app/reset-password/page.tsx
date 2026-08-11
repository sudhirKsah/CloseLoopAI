"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-[#09090b] text-white lg:grid-cols-2">
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">
              C
            </span>
            CloseLoop
          </Link>

          {!token ? (
            <div className="mt-10">
              <p className="text-2xl font-semibold tracking-tight">Invalid link</p>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                This reset link is missing a token. Use the link from your email
                to reset your password.
              </p>
              <Link href="/forgot-password" className="mt-6 block">
                <Button variant="secondary" className="w-full">
                  Request a new link
                </Button>
              </Link>
            </div>
          ) : done ? (
            <div className="mt-10">
              <p className="text-2xl font-semibold tracking-tight">
                Password reset
              </p>
              <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-200">
                Your password has been changed successfully.
              </div>
              <Link href="/login" className="mt-6 block">
                <Button className="w-full">
                  Go to login <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-10">
                <p className="text-2xl font-semibold tracking-tight">
                  Set a new password
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Enter your new password below.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <label className="block text-xs text-zinc-400">
                  New password
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 transition focus-within:border-emerald-300/60">
                    <Lock size={16} className="text-zinc-500" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                    />
                  </div>
                </label>
                <label className="block text-xs text-zinc-400">
                  Confirm password
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 transition focus-within:border-emerald-300/60">
                    <Lock size={16} className="text-zinc-500" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                    />
                  </div>
                </label>
                {error && (
                  <p className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading ? "Resetting…" : <>Reset password <ArrowRight size={16} /></>}
                </Button>
              </form>
            </>
          )}
        </div>
      </section>

      <aside className="hidden bg-[#101116] p-12 lg:flex lg:flex-col lg:justify-between">
        <p className="text-sm text-zinc-500">EXECUTION INTELLIGENCE</p>
        <blockquote className="max-w-lg text-3xl font-medium leading-[1.25] tracking-tight">
          &ldquo;CloseLoop made our team&apos;s invisible commitments visible —
          without adding another meeting.&rdquo;
          <footer className="mt-7 text-sm font-normal text-zinc-500">
            Elena Rossi · VP Operations
          </footer>
        </blockquote>
        <p className="text-xs text-zinc-600">© 2026 CloseLoop, Inc.</p>
      </aside>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#09090b]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-300" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
