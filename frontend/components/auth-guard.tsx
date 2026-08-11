"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

/** Redirects to /login if the user is not authenticated. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-300" />
      </div>
    );
  }
  if (!token) return null;
  return <>{children}</>;
}
