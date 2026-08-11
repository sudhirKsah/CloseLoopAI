"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#09090b] px-5 text-white">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-400/10 text-rose-300">
          <AlertTriangle size={26} />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          An unexpected error occurred. Try again, or go back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-zinc-600">Error ID: {error.digest}</p>
        )}
        <div className="mt-7 flex justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw size={15} /> Try again
          </Button>
          <Link href="/dashboard">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
