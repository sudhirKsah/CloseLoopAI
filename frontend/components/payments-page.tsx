"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Crown,
  X,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPaymentConfig,
  createOrder,
  verifyPayment,
  listOrders,
  listPayments,
  openRazorpayCheckout,
  type PaymentConfig,
  type OrderListItem,
  type PaymentListItem,
} from "@/lib/payments";

// ─── Pricing Plans ───────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number; // in paise
  currency: string;
  period: string;
  icon: typeof Sparkles;
  tagline: string;
  highlighted?: boolean;
  badge?: string;
  features: string[];
  notIncluded?: string[];
}

const PLANS: Plan[] = [
  {
    id: "weekly",
    name: "Weekly",
    price: 100000, // ₹1,000 in paise
    currency: "INR",
    period: "week",
    icon: Sparkles,
    tagline: "Try it out — no commitment",
    features: [
      "Full AI PM chat access",
      "Up to 3 team members",
      "1 active project",
      "Slack integration",
      "Basic team skill tracking",
      "Email support",
    ],
    notIncluded: [
      "Auto Slack outreach to engineers",
      "Multiple concurrent projects",
    ],
  },
  {
    id: "monthly",
    name: "Monthly",
    price: 300000, // ₹3,000 in paise
    currency: "INR",
    period: "month",
    icon: TrendingUp,
    tagline: "Best for growing teams",
    highlighted: true,
    badge: "Most Popular",
    features: [
      "Everything in Weekly, plus:",
      "Up to 10 team members",
      "5 active projects",
      "Auto Slack outreach & check-ins",
      "Deep team skill & strength analysis",
      "Auto task assignment by skills",
      "Project kickoff automation",
      "Priority support (24h response)",
    ],
    notIncluded: [],
  },
  {
    id: "yearly",
    name: "Yearly",
    price: 3000000, // ₹30,000 in paise
    currency: "INR",
    period: "year",
    icon: Crown,
    tagline: "Best value — save ₹6,000",
    badge: "Save 17%",
    features: [
      "Everything in Monthly, plus:",
      "Unlimited team members",
      "Unlimited active projects",
      "Advanced PM analytics & reports",
      "Custom AI PM personality tuning",
      "Webhook integrations (Jira, GitHub)",
      "Dedicated account manager",
      "24/7 priority support",
      "Early access to new features",
    ],
    notIncluded: [],
  },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export function PaymentsPage() {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [cfg, ords, pays] = await Promise.all([
        getPaymentConfig(workspaceId),
        listOrders(workspaceId),
        listPayments(workspaceId),
      ]);
      setConfig(cfg);
      setOrders(ords);
      setPayments(pays);
    } catch {
      toast("Failed to load payment data", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatAmount = (paise: number, curr: string) => {
    const value = paise / 100;
    if (curr === "INR") return `₹${value.toLocaleString("en-IN")}`;
    if (curr === "USD") return `$${value.toLocaleString("en-US")}`;
    return `${value.toLocaleString()} ${curr}`;
  };

  const subscribe = async (plan: Plan) => {
    if (!workspaceId || !config) return;
    setBusy(true);
    try {
      const order = await createOrder(workspaceId, {
        amount: plan.price,
        currency: plan.currency,
        description: `CloseLoop AI — ${plan.name} plan (${plan.period})`,
        notes: { plan: plan.id, period: plan.period },
      });

      await openRazorpayCheckout({
        key_id: order.key_id,
        order_id: order.razorpay_order_id,
        amount: order.amount,
        currency: order.currency,
        name: "CloseLoop AI",
        description: `${plan.name} plan — ${plan.period}ly subscription`,
        onSuccess: async (response) => {
          try {
            const verified = await verifyPayment(workspaceId, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast(
              `${plan.name} plan activated! Paid ${formatAmount(verified.amount, verified.currency)}`,
              "success",
            );
            void load();
          } catch {
            toast("Payment verification failed — please contact support", "error");
          }
        },
        onDismiss: () => {
          toast("Payment cancelled", "info");
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />

      {/* Not configured warning */}
      {config && !config.configured && (
        <Card className="mb-6 border-amber-300/20 bg-amber-500/[.04] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-100">
                Razorpay is not configured yet
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                To start accepting payments, add your Razorpay keys to the backend{" "}
                <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">.env</code> file:
              </p>
              <pre className="mt-2 rounded-lg bg-black/40 p-3 text-[11px] text-zinc-300">
{`RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXX`}
              </pre>
              <p className="mt-2 text-xs text-zinc-500">
                Get free test keys at{" "}
                <a
                  href="https://dashboard.razorpay.com/app/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-300 underline"
                >
                  dashboard.razorpay.com
                </a>
                . Test mode works without any legal paperwork.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Pricing cards */}
      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isSelected = billingPeriod === plan.id;
          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col p-6 transition ${
                plan.highlighted
                  ? "border-emerald-400/40 bg-emerald-500/[.04] ring-1 ring-emerald-400/20"
                  : "border-white/[.08] bg-white/[.02]"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      plan.highlighted
                        ? "bg-emerald-400 text-zinc-950"
                        : "bg-violet-500/80 text-white"
                    }`}
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-2">
                <div
                  className={`grid size-9 place-items-center rounded-xl ${
                    plan.highlighted
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-white/[.06] text-zinc-300"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-[11px] text-zinc-500">{plan.tagline}</p>
                </div>
              </div>

              {/* Price */}
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-bold">
                  {formatAmount(plan.price, plan.currency)}
                </span>
                <span className="text-sm text-zinc-500">/{plan.period}</span>
              </div>

              {/* Subscribe button */}
              <Button
                onClick={() => subscribe(plan)}
                disabled={busy}
                size="lg"
                variant={plan.highlighted ? "primary" : "secondary"}
                className="mt-4 w-full"
              >
                <CreditCard size={15} />
                {busy ? "Processing..." : `Subscribe ${plan.name}`}
              </Button>

              {/* Features */}
              <div className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature, i) => {
                  const isHeader = feature.endsWith(":") || i === 0 && plan.features[0].includes("Everything in");
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2
                        className={`mt-0.5 size-4 shrink-0 ${
                          isHeader ? "text-emerald-300" : "text-emerald-400"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          isHeader ? "font-medium text-zinc-200" : "text-zinc-400"
                        }`}
                      >
                        {feature}
                      </span>
                    </div>
                  );
                })}
                {plan.notIncluded && plan.notIncluded.length > 0 && (
                  <>
                    {plan.notIncluded.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2 opacity-50">
                        <X className="mt-0.5 size-4 shrink-0 text-zinc-600" />
                        <span className="text-sm text-zinc-600 line-through">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Payment methods info */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-600">
        <span>Accepted payment methods:</span>
        <span className="rounded-md bg-white/[.04] px-2 py-1">UPI</span>
        <span className="rounded-md bg-white/[.04] px-2 py-1">Credit Card</span>
        <span className="rounded-md bg-white/[.04] px-2 py-1">Debit Card</span>
        <span className="rounded-md bg-white/[.04] px-2 py-1">Netbanking</span>
        <span className="rounded-md bg-white/[.04] px-2 py-1">Wallets</span>
        <span className="rounded-md bg-white/[.04] px-2 py-1">International Cards</span>
      </div>

      {/* Payment history */}
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {/* Recent payments */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Payment History</h3>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          {payments.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No payments yet. Choose a plan above to get started.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-white/[.06] bg-white/[.02] p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {formatAmount(p.amount, p.currency)}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {p.method || "payment"} ·{" "}
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString()
                        : ""}
                    </p>
                  </div>
                  <Badge variant="success">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent orders */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-zinc-500" />
            <h3 className="text-sm font-semibold">Order History</h3>
          </div>
          {orders.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No orders yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-lg border border-white/[.06] bg-white/[.02] p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {formatAmount(o.amount, o.currency)}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {o.description || "Order"} ·{" "}
                      {o.created_at
                        ? new Date(o.created_at).toLocaleDateString()
                        : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      o.status === "paid" ? "success" :
                      o.status === "failed" ? "warning" : "default"
                    }
                  >
                    {o.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-7">
      <p className="text-[11px] font-medium tracking-[.16em] text-emerald-300">
        PRICING
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
        Choose Your Plan
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Simple, transparent pricing. Pay via UPI, card, netbanking, or wallet.
        Cancel anytime.
      </p>
    </div>
  );
}
