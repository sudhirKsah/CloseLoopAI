"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Mail, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "already" | "error" | "idle">("idle");
  const [error, setError] = useState<string>();
  const [email, setEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    void (async () => {
      try {
        const result = await api<{ verified: boolean; already?: boolean }>(
          "/auth/verify-email",
          { method: "POST", body: JSON.stringify({ token }) },
        );
        setStatus(result.already ? "already" : "success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
        setStatus("error");
      }
    })();
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      await api("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResendSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
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
              <p className="text-2xl font-semibold tracking-tight">Verify your email</p>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Enter your email address and we&apos;ll send you a new verification link.
              </p>
              {resendSent ? (
                <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-200">
                  <p className="font-medium">Check your email</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    If an account exists for <span className="text-emerald-200">{email}</span>,
                    you&apos;ll receive a verification link shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleResend} className="mt-7 space-y-4">
                  <label className="block text-xs text-zinc-400">
                    Email
                    <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 transition focus-within:border-emerald-300/60">
                      <Mail size={16} className="text-zinc-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                      />
                    </div>
                  </label>
                  {error && (
                    <p className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-300">
                      {error}
                    </p>
                  )}
                  <Button type="submit" className="w-full" size="lg">
                    Send verification link <ArrowRight size={16} />
                  </Button>
                </form>
              )}
              <Link href="/login" className="mt-6 block text-center text-sm text-zinc-500 hover:text-white">
                Back to login
              </Link>
            </div>
          ) : status === "loading" ? (
            <div className="mt-10 flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin text-emerald-300" />
              <p className="text-sm text-zinc-400">Verifying your email…</p>
            </div>
          ) : status === "success" || status === "already" ? (
            <div className="mt-10">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={28} className="text-emerald-300" />
                <p className="text-2xl font-semibold tracking-tight">
                  {status === "already" ? "Already verified" : "Email verified"}
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                {status === "already"
                  ? "Your email was already verified. You can log in now."
                  : "Your email has been verified successfully. You can now log in to your account."}
              </p>
              <Link href="/login" className="mt-6 block">
                <Button className="w-full" size="lg">
                  Go to login <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="mt-10">
              <div className="flex items-center gap-3">
                <AlertCircle size={28} className="text-rose-400" />
                <p className="text-2xl font-semibold tracking-tight">Verification failed</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                {error ?? "This verification link is invalid or has expired."}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Enter your email to receive a new link.
              </p>
              {resendSent ? (
                <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-200">
                  <p className="font-medium">Check your email</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    If an account exists, you&apos;ll receive a verification link shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleResend} className="mt-6 space-y-4">
                  <label className="block text-xs text-zinc-400">
                    Email
                    <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 transition focus-within:border-emerald-300/60">
                      <Mail size={16} className="text-zinc-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                      />
                    </div>
                  </label>
                  {error && (
                    <p className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-300">
                      {error}
                    </p>
                  )}
                  <Button type="submit" className="w-full" size="lg">
                    Resend verification link <ArrowRight size={16} />
                  </Button>
                </form>
              )}
              <Link href="/login" className="mt-6 block text-center text-sm text-zinc-500 hover:text-white">
                Back to login
              </Link>
            </div>
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

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#09090b]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-300" />
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
