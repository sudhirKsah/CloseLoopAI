"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";

export type SubscriptionState = {
  allowed: boolean;
  plan: string;
  status: string;
  trial_end: string | null;
  paid_until: string | null;
  days_remaining: number;
  is_platform_admin: boolean;
};

type SubContext = {
  sub: SubscriptionState | null;
  loading: boolean;
  reload: () => Promise<void>;
};

const Ctx = createContext<SubContext | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<SubscriptionState>("/auth/me/subscription");
      setSub(data);
    } catch {
      // If the endpoint fails, allow access (fail open rather than lock
      // users out of a broken deployment).
      setSub({
        allowed: true,
        plan: "trial",
        status: "active",
        trial_end: null,
        paid_until: null,
        days_remaining: 0,
        is_platform_admin: false,
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Ctx.Provider value={{ sub, loading, reload }}>{children}</Ctx.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SubscriptionProvider missing");
  return ctx;
}
