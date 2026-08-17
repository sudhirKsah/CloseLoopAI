"use client";

import { useSubscription } from "@/components/subscription-provider";
import { BillingWall } from "@/components/billing-wall";

/**
 * Wraps the authenticated app. If the subscription check returns
 * `allowed: false`, shows the billing wall instead of the app.
 * Platform admins always pass through.
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { sub, loading } = useSubscription();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-300" />
      </div>
    );
  }

  // Fail open if we couldn't load the subscription (sub is null but
  // loading is done) — better than locking users out of a broken deploy.
  if (sub && !sub.allowed && !sub.is_platform_admin) {
    return <BillingWall />;
  }

  return <>{children}</>;
}
