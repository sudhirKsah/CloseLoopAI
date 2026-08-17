"use client";

import Link from "next/link";
import { ArrowRight, Clock, Crown, Sparkles, TrendingUp } from "lucide-react";
import { useSubscription } from "@/components/subscription-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: "₹3,000",
    period: "/month",
    icon: TrendingUp,
    tagline: "Best for growing teams",
    highlighted: true,
    features: [
      "Up to 10 team members",
      "5 active projects",
      "Auto Slack outreach & check-ins",
      "Deep team skill & strength analysis",
      "Auto task assignment by skills",
      "Priority support (24h response)",
    ],
  },
  {
    id: "yearly",
    name: "Yearly",
    price: "₹30,000",
    period: "/year",
    icon: Crown,
    tagline: "Best value — save ₹6,000",
    badge: "Save 17%",
    features: [
      "Unlimited team members",
      "Unlimited active projects",
      "Advanced PM analytics & reports",
      "Custom AI PM personality tuning",
      "Webhook integrations (Jira, GitHub)",
      "24/7 priority support",
      "Early access to new features",
    ],
  },
];

export function BillingWall() {
  const { sub } = useSubscription();

  return (
    <main className="grid min-h-screen place-items-center bg-[#09090b] px-5 text-white">
      <div className="w-full max-w-3xl">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2.5 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">
            P
          </span>
          Pathayo
        </Link>

        {/* Trial expired banner */}
        <div className="mt-10 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-6 text-center">
          <Clock className="mx-auto text-amber-300" size={28} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Your free trial has ended
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {sub?.is_platform_admin
              ? "As a platform admin you still have access, but this workspace's trial has expired."
              : "Subscribe to a plan below to keep your AI meeting bot, task tracking, and integrations running."}
          </p>
        </div>

        {/* Plans */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`p-6 ${plan.highlighted ? "border-emerald-300/30 bg-emerald-300/[.03]" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[.07]">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-xs text-zinc-500">{plan.tagline}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-zinc-500">{plan.period}</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                      <span className="mt-0.5 text-emerald-300">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={`mailto:payment@mail.pathayo.com?subject=Pathayo%20${plan.name}%20Plan&body=Hi%20Pathayo%20team%2C%0A%0AI%27d%20like%20to%20subscribe%20to%20the%20${plan.name}%20plan.%0A%0AThanks!`}
                  className="mt-5 block"
                >
                  <Button
                    size="lg"
                    variant={plan.highlighted ? "primary" : "secondary"}
                    className="w-full"
                  >
                    Subscribe to {plan.name} <ArrowRight size={14} />
                  </Button>
                </a>
              </Card>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Online checkout coming soon. Email us to subscribe manually — usually
          set up within a few hours.
        </p>

        <div className="mt-6 text-center">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log out
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
