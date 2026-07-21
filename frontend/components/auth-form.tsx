"use client";

import Link from "next/link";
import { SignIn, SignUp } from "@clerk/nextjs";

export function AuthForm({ mode }: { mode:"login"|"signup" }) {
  const signup = mode === "signup";
  return <main className="grid min-h-screen bg-[#09090b] text-white lg:grid-cols-2"><section className="flex items-center justify-center px-5 py-12"><div className="w-full max-w-sm"><Link href="/" className="flex items-center gap-2.5 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">C</span>CloseLoop</Link><div className="mt-10"><p className="text-2xl font-semibold tracking-tight">{signup ? "Build a calmer execution culture." : "Welcome back."}</p><p className="mt-2 text-sm leading-6 text-zinc-500">{signup ? "Create your private owner workspace." : "Sign in to see what your team needs next."}</p></div><div className="mt-7"><>{signup ? <SignUp routing="path" path="/signup" signInUrl="/login" fallbackRedirectUrl="/dashboard"/> : <SignIn routing="path" path="/login" signUpUrl="/signup" fallbackRedirectUrl="/dashboard"/>}</></div></div></section><aside className="hidden bg-[#101116] p-12 lg:flex lg:flex-col lg:justify-between"><p className="text-sm text-zinc-500">EXECUTION INTELLIGENCE</p><blockquote className="max-w-lg text-3xl font-medium leading-[1.25] tracking-tight">“CloseLoop made our team&apos;s invisible commitments visible — without adding another meeting.”<footer className="mt-7 text-sm font-normal text-zinc-500">Elena Rossi · VP Operations</footer></blockquote><p className="text-xs text-zinc-600">© 2026 CloseLoop, Inc.</p></aside></main>;
}
