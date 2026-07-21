import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-[#09090b] px-5 text-white"><div className="max-w-md text-center"><Link href="/" className="inline-flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">C</span>CloseLoop</Link><p className="mt-12 text-xs font-medium tracking-[.18em] text-emerald-300">404 · NOT FOUND</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">This loop doesn&apos;t exist.</h1><p className="mt-4 text-sm leading-6 text-zinc-500">The page may have moved, or the link is incomplete. Return to CloseLoop and continue where the work is.</p><Link href="/dashboard" className="mt-8 inline-flex h-10 items-center rounded-xl bg-emerald-300 px-4 text-sm font-medium text-zinc-950">Go to dashboard</Link></div></main>;
}
