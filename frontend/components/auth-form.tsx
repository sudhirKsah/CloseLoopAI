"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Mail, Lock, User } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";

export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" }) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        router.push("/dashboard");
      } else if (mode === "signup") {
        await signup(name, email, password);
        router.push("/dashboard");
      } else if (mode === "forgot") {
        const result = await api<{
          sent: boolean;
          reset_token?: string;
          dev_mode?: boolean;
        }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setSent(true);
        if (result.dev_mode && result.reset_token) {
          // Dev mode — no SMTP configured, backend returns the token directly
          setResetToken(result.reset_token);
        }
        // In production, the email is sent and the user clicks the link
        // in their email which takes them to /reset-password?token=...
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

          <div className="mt-10">
            <p className="text-2xl font-semibold tracking-tight">
              {mode === "signup"
                ? "Build a calmer execution culture."
                : mode === "forgot"
                  ? "Reset your password"
                  : "Welcome back."}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {mode === "signup"
                ? "Create your private owner workspace."
                : mode === "forgot"
                  ? "Enter your email and we'll send you a reset link."
                  : "Sign in to see what your team needs next."}
            </p>
          </div>

          {/* Forgot password — email sent state */}
          {mode === "forgot" && sent && (
            <div className="mt-7 space-y-4">
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-200">
                {resetToken ? (
                  <>
                    <p className="font-medium">Dev mode — SMTP not configured</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      In production, a reset link would be emailed. For local dev,
                      use the link below:
                    </p>
                    <Link
                      href={`/reset-password?token=${resetToken}`}
                      className="mt-3 block"
                    >
                      <Button variant="secondary" className="w-full">
                        Open reset page
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Check your email</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      If an account exists for <span className="text-emerald-200">{email}</span>,
                      you&apos;ll receive a password reset link shortly. The link
                      expires in 1 hour.
                    </p>
                  </>
                )}
              </div>
              <Link href="/login" className="block text-center text-sm text-zinc-500 hover:text-white">
                Back to login
              </Link>
            </div>
          )}

          {/* Login / Signup / Forgot (initial) forms */}
          {mode !== "forgot" || !sent ? (
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {mode === "signup" && (
                <Field
                  icon={<User size={16} />}
                  label="Full name"
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="Jane Doe"
                  required
                />
              )}
              <Field
                icon={<Mail size={16} />}
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                required
              />
              {mode !== "forgot" && (
                <Field
                  icon={<Lock size={16} />}
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                />
              )}

              {error && (
                <p className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-300">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading
                  ? "Please wait…"
                  : mode === "signup"
                    ? <>Create account <ArrowRight size={16} /></>
                    : mode === "forgot"
                      ? "Send reset link"
                      : <>Sign in <ArrowRight size={16} /></>}
              </Button>

              {mode === "login" && (
                <Link
                  href="/forgot-password"
                  className="block text-center text-xs text-zinc-500 transition hover:text-white"
                >
                  Forgot your password?
                </Link>
              )}
            </form>
          ) : null}

          {mode === "login" && (
            <p className="mt-6 text-center text-sm text-zinc-500">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-emerald-300 hover:underline">
                Sign up
              </Link>
            </p>
          )}
          {mode === "signup" && (
            <p className="mt-6 text-center text-sm text-zinc-500">
              Already have an account?{" "}
              <Link href="/login" className="text-emerald-300 hover:underline">
                Log in
              </Link>
            </p>
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

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 transition focus-within:border-emerald-300/60">
        <span className="text-zinc-500">{icon}</span>
        <input
          type={type}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </div>
    </label>
  );
}
