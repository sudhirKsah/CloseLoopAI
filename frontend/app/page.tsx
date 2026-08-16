import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Check,
  CreditCard,
  Crown,
  FileBarChart,
  Github,
  ListChecks,
  Mail,
  Slack,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#09090b] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/[.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">
              C
            </span>
            CloseLoop
          </Link>
          <nav className="hidden gap-7 text-sm text-zinc-400 md:flex">
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#integrations" className="transition hover:text-white">Integrations</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#contact" className="transition hover:text-white">Contact</a>
          </nav>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">
                Get started <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 md:pt-24">
        <div className="absolute inset-x-0 top-0 -z-10 h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(110,231,183,.10),transparent_60%)]" />
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-xs text-emerald-200">
            <Sparkles size={13} /> AI meeting bot + execution tracker
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
            An AI bot joins your meetings,{" "}
            <span className="text-emerald-300">extracts every decision</span>,
            and tracks it until shipped.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-7 text-zinc-400">
            CloseLoop sends a bot to your Google Meet, Zoom, or Teams call. It
            transcribes the meeting, uses AI to pull out decisions, tasks, and
            risks — then watches GitHub, Slack, and Jira to make sure the work
            actually gets done. You get alerted before things slip.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">
                Start free <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="secondary">
                See the dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Pipeline visual */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="grid gap-3 md:grid-cols-4">
            <PipelineStep
              icon={<Bot size={20} />}
              step="01"
              title="Bot joins"
              desc="Recall.ai bot attends your meeting and records the full transcript."
              accent
            />
            <PipelineStep
              icon={<Sparkles size={20} />}
              step="02"
              title="AI extracts"
              desc="Decisions, action items, owners, and deadlines are pulled from the transcript."
            />
            <PipelineStep
              icon={<Github size={20} />}
              step="03"
              title="Tools tracked"
              desc="GitHub commits, Slack messages, and Jira tickets are matched to each task."
            />
            <PipelineStep
              icon={<AlertTriangle size={20} />}
              step="04"
              title="You get alerted"
              desc="Slack reminders and escalation alerts fire before work stalls."
            />
          </div>
        </div>
      </section>

      {/* How it works — detailed */}
      <section id="how" className="border-y border-white/[.07] bg-[#0c0c10]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            From meeting to shipped — automatically.
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            No more "who said they'd do what?" CloseLoop captures the full
            conversation, turns it into owned tasks, and holds people
            accountable with real signals from the tools they already use.
          </p>

          <div className="mt-12 space-y-8">
            <FlowRow
              icon={<Bot size={22} />}
              title="1. A bot joins your meeting"
              desc="Add a meeting URL and CloseLoop sends a Recall.ai bot. It joins Google Meet, Zoom, Microsoft Teams, or Slack Huddles, records audio, and produces a full timestamped transcript. No plugins, no manual recording."
              mockup={
                <div className="rounded-xl border border-white/[.08] bg-[#111116] p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Calendar size={13} /> Weekly product review · 32 min
                  </div>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs leading-5 text-zinc-300">
                      <span className="text-emerald-300">Sarah:</span> We need
                      to ship the OAuth redesign by Friday. Dave, can you own
                      that?
                    </p>
                    <p className="text-xs leading-5 text-zinc-300">
                      <span className="text-violet-300">Dave:</span> Yeah, I'll
                      open a PR by Wednesday and tag it for review.
                    </p>
                    <p className="text-xs leading-5 text-zinc-300">
                      <span className="text-emerald-300">Sarah:</span> Perfect.
                      Let's also deprioritize the retention dashboard.
                    </p>
                  </div>
                </div>
              }
            />
            <FlowRow
              icon={<Sparkles size={22} />}
              title="2. AI extracts decisions, tasks, and risks"
              desc="The transcript is processed by an LLM that identifies every commitment made, who owns it, when it's due, and what could go wrong. Low-confidence items go to an approval queue — you stay in control."
              mockup={
                <div className="space-y-2">
                  <ExtractCard
                    type="Task"
                    title="Ship OAuth consent redesign"
                    owner="Dave"
                    due="Fri"
                    confidence={94}
                  />
                  <ExtractCard
                    type="Decision"
                    title="Deprioritize retention dashboard"
                    owner="Sarah"
                    due="—"
                    confidence={88}
                  />
                  <ExtractCard
                    type="Risk"
                    title="OAuth PR review may bottleneck"
                    owner="—"
                    due="—"
                    confidence={71}
                  />
                </div>
              }
              reverse
            />
            <FlowRow
              icon={<Github size={22} />}
              title="3. Real signals from your tools"
              desc="CloseLoop connects to GitHub, Slack, Jira, and Linear. It matches commits, PRs, and messages to each task — so you know what's actually happening, not just what people say in standups."
              mockup={
                <div className="rounded-xl border border-white/[.08] bg-[#111116] p-4">
                  <p className="text-sm font-medium">OAuth consent redesign</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Execution score: 78 · In progress
                  </p>
                  <div className="mt-3 space-y-2">
                    <SignalRow
                      icon={<Github size={13} />}
                      text="PR #142 opened: feat/oauth-consent"
                      time="2h ago"
                    />
                    <SignalRow
                      icon={<Slack size={13} />}
                      text={`Dave: "PR is up for review"`}
                      time="1h ago"
                    />
                    <SignalRow
                      icon={<CheckCircle2 size={13} />}
                      text="CI passing on main"
                      time="30m ago"
                    />
                  </div>
                </div>
              }
            />
            <FlowRow
              icon={<AlertTriangle size={22} />}
              title="4. Alerts before things slip"
              desc="Configure escalation rules: if a task has no activity for 3 days, send a Slack reminder. After 5 days, escalate to the manager. After 7, escalate to the founder. You define the thresholds."
              mockup={
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-300" />
                    <p className="text-sm font-medium text-amber-200">
                      Escalation: Enterprise security brief
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">
                    No activity for 5 days. Escalated to manager.
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Owner: Sarah · Due: 2 days ago · Score: 34
                  </p>
                </div>
              }
              reverse
            />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Everything you need to close the loop.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Bot size={18} />}
            title="Meeting transcription"
            desc="Recall.ai bot joins automatically. Full transcript with speaker labels and timestamps."
          />
          <FeatureCard
            icon={<Sparkles size={18} />}
            title="AI extraction"
            desc="Decisions, tasks, risks, and questions — with confidence scores and evidence citations."
          />
          <FeatureCard
            icon={<ListChecks size={18} />}
            title="Approval queue"
            desc="Low-confidence extractions go to human review. You approve or reject before tasks are created."
          />
          <FeatureCard
            icon={<Github size={18} />}
            title="GitHub sync"
            desc="Webhooks auto-register when you select repos. Commits, PRs, and issues matched to tasks."
          />
          <FeatureCard
            icon={<Slack size={18} />}
            title="Slack delivery"
            desc="Reminders and escalations delivered to the right channel. Directory sync from Slack."
          />
          <FeatureCard
            icon={<FileBarChart size={18} />}
            title="Weekly reports"
            desc="Friday execution summaries with completion rates, missed deadlines, and trend scores."
          />
          <FeatureCard
            icon={<AlertTriangle size={18} />}
            title="Escalation rules"
            desc="Configurable thresholds. Slack nudge → manager escalation → founder alert."
          />
          <FeatureCard
            icon={<Zap size={18} />}
            title="Execution scoring"
            desc="Every task gets a 0–100 score based on activity, deadlines, and confidence."
          />
          <FeatureCard
            icon={<Calendar size={18} />}
            title="Calendar sync"
            desc="Google Calendar and Microsoft 365. Meetings auto-detected and bots scheduled."
          />
        </div>
      </section>

      {/* Integrations */}
      <section
        id="integrations"
        className="border-y border-white/[.07] bg-[#0c0c10]"
      >
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Connects to the tools your team already uses.
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            OAuth-based integrations. Connect only what you need — CloseLoop
            pulls signals from each source and matches them to your tasks.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            {[
              ["GitHub", "Commits, PRs, issues"],
              ["Slack", "Messages, directory sync"],
              ["Google Calendar", "Meeting detection"],
              ["Microsoft 365", "Calendar + Teams"],
              ["Jira", "Project tracking"],
              ["Linear", "Issue tracking"],
              ["Notion", "Documentation"],
              ["Recall.ai", "Meeting bots"],
            ].map(([name, desc]) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-[#111116] px-4 py-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.06] text-xs font-bold">
                  {name[0]}
                </span>
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-zinc-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-white/[.07] bg-[#0c0c10]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="text-center">
            <p className="text-[11px] font-medium tracking-[.16em] text-emerald-300">
              PRICING
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">
              Start with a free trial. Upgrade when your team is ready. No hidden fees.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <PricingCard
              icon={<Sparkles size={18} />}
              name="Free Trial"
              price="Free"
              period="1 week"
              tagline="No card needed — try it out"
              features={[
                "Full AI PM chat access",
                "Up to 3 team members",
                "1 active project",
                "Slack integration",
                "Basic team skill tracking",
                "Email support",
              ]}
            />
            <PricingCard
              icon={<TrendingUp size={18} />}
              name="Monthly"
              price="₹3,000"
              period="month"
              tagline="Best for growing teams"
              highlighted
              badge="Most Popular"
              features={[
                "Up to 10 team members",
                "5 active projects",
                "Auto Slack outreach & check-ins",
                "Deep team skill & strength analysis",
                "Auto task assignment by skills",
                "Project kickoff automation",
                "Priority support (24h response)",
              ]}
            />
            <PricingCard
              icon={<Crown size={18} />}
              name="Yearly"
              price="₹30,000"
              period="year"
              tagline="Best value — save ₹6,000"
              badge="Save 17%"
              features={[
                "Unlimited team members",
                "Unlimited active projects",
                "Advanced PM analytics & reports",
                "Custom AI PM personality tuning",
                "Webhook integrations (Jira, GitHub)",
                "Dedicated account manager",
                "24/7 priority support",
                "Early access to new features",
              ]}
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-600">
            <span>Accepted payment methods:</span>
            <span className="rounded-md bg-white/[.04] px-2 py-1">UPI</span>
            <span className="rounded-md bg-white/[.04] px-2 py-1">Credit Card</span>
            <span className="rounded-md bg-white/[.04] px-2 py-1">Debit Card</span>
            <span className="rounded-md bg-white/[.04] px-2 py-1">Netbanking</span>
            <span className="rounded-md bg-white/[.04] px-2 py-1">International Cards</span>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-600">
            Online checkout coming soon.{" "}
            <a href="mailto:payment@mail.pathayo.com" className="text-emerald-300 hover:underline">
              Contact us
            </a>{" "}
            to subscribe manually.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
          Stop losing decisions to{" "}
          <span className="text-emerald-300">forgotten meetings.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">
          Set up in 2 minutes. Send a bot to your next meeting and watch every
          commitment get tracked to completion.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup">
            <Button size="lg">
              Start your workspace <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">
              Log in
            </Button>
          </Link>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-white/[.07] bg-[#0c0c10]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Get in touch
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Questions, feedback, or partnership ideas? We respond within 24 hours.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <ContactCard
              icon={<Mail size={18} />}
              title="General support"
              email="support@mail.pathayo.com"
              desc="Account issues, bug reports, how-to questions"
            />
            <ContactCard
              icon={<CreditCard size={18} />}
              title="Billing & payments"
              email="payment@mail.pathayo.com"
              desc="Subscriptions, invoices, plan changes, refunds"
            />
            <ContactCard
              icon={<Sparkles size={18} />}
              title="Sales & partnerships"
              email="hello@mail.pathayo.com"
              desc="Enterprise plans, custom integrations, partnerships"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[.06] py-10">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2.5 font-semibold">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">
                  C
                </span>
                CloseLoop
              </Link>
              <p className="mt-3 text-xs leading-5 text-zinc-600">
                AI meeting bot + execution tracker. Every decision, tracked to ship.
              </p>
            </div>
            <FooterCol
              title="Product"
              links={[
                ["How it works", "#how"],
                ["Features", "#features"],
                ["Integrations", "#integrations"],
                ["Pricing", "#pricing"],
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                ["Sign up", "/signup"],
                ["Log in", "/login"],
                ["Contact", "#contact"],
              ]}
            />
            <div>
              <p className="text-xs font-medium text-zinc-400">Reach us</p>
              <div className="mt-3 space-y-1.5">
                <a href="mailto:support@mail.pathayo.com" className="block text-xs text-zinc-600 transition hover:text-emerald-300">
                  support@mail.pathayo.com
                </a>
                <a href="mailto:payment@mail.pathayo.com" className="block text-xs text-zinc-600 transition hover:text-emerald-300">
                  payment@mail.pathayo.com
                </a>
                <a href="mailto:hello@mail.pathayo.com" className="block text-xs text-zinc-600 transition hover:text-emerald-300">
                  hello@mail.pathayo.com
                </a>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/[.06] pt-6 text-xs text-zinc-600 sm:flex-row">
            <span>© 2026 CloseLoop, Inc. All rights reserved.</span>
            <span>Powered by pathayo.com</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PipelineStep({
  icon,
  step,
  title,
  desc,
  accent,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-emerald-300/20 bg-emerald-300/[.04]"
          : "border-white/[.08] bg-[#111116]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${
            accent ? "bg-emerald-300/15 text-emerald-300" : "bg-white/[.06] text-zinc-400"
          }`}
        >
          {icon}
        </span>
        <span className="text-xs font-medium text-zinc-600">{step}</span>
      </div>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-zinc-500">{desc}</p>
    </div>
  );
}

function FlowRow({
  icon,
  title,
  desc,
  mockup,
  reverse,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  mockup: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid gap-8 md:grid-cols-2 md:items-center ${
        reverse ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300">
          {icon}
        </span>
        <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-3 leading-7 text-zinc-400">{desc}</p>
      </div>
      <div>{mockup}</div>
    </div>
  );
}

function ExtractCard({
  type,
  title,
  owner,
  due,
  confidence,
}: {
  type: string;
  title: string;
  owner: string;
  due: string;
  confidence: number;
}) {
  const color =
    type === "Task"
      ? "text-emerald-300"
      : type === "Decision"
        ? "text-sky-300"
        : "text-amber-300";
  return (
    <div className="rounded-xl border border-white/[.08] bg-[#111116] p-3">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${color}`}>{type}</span>
        <span className="text-xs text-zinc-600">{confidence}% confidence</span>
      </div>
      <p className="mt-1.5 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Owner: {owner} · Due: {due}
      </p>
    </div>
  );
}

function SignalRow({
  icon,
  text,
  time,
}: {
  icon: React.ReactNode;
  text: string;
  time: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="text-zinc-500">{icon}</span>
      <span className="flex-1">{text}</span>
      <span className="text-zinc-600">{time}</span>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-[#111116] p-5 transition hover:border-white/[.12]">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300">
        {icon}
      </span>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1.5 text-sm leading-6 text-zinc-500">{desc}</p>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  email,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  email: string;
  desc: string;
}) {
  return (
    <a
      href={`mailto:${email}`}
      className="group rounded-2xl border border-white/[.08] bg-[#111116] p-5 transition hover:border-emerald-300/30 hover:bg-emerald-500/[.03]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300 transition group-hover:scale-110">
        {icon}
      </span>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 text-sm text-emerald-300/80">{email}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{desc}</p>
    </a>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400">{title}</p>
      <div className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <Link
            key={label}
            href={href}
            className="block text-xs text-zinc-600 transition hover:text-emerald-300"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function PricingCard({
  icon,
  name,
  price,
  period,
  tagline,
  features,
  highlighted,
  badge,
}: {
  icon: React.ReactNode;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition ${
        highlighted
          ? "border-emerald-400/40 bg-emerald-500/[.04] ring-1 ring-emerald-400/20"
          : "border-white/[.08] bg-[#111116]"
      }`}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              highlighted ? "bg-emerald-400 text-zinc-950" : "bg-violet-500/80 text-white"
            }`}
          >
            {badge}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span
          className={`grid size-9 place-items-center rounded-xl ${
            highlighted ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[.06] text-zinc-300"
          }`}
        >
          {icon}
        </span>
        <div>
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-[11px] text-zinc-500">{tagline}</p>
        </div>
      </div>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-sm text-zinc-500">/{period}</span>
      </div>
      <Link href="/signup" className="mt-4 block">
        <Button
          size="lg"
          variant={highlighted ? "primary" : "secondary"}
          className="w-full"
        >
          Get started <ArrowRight size={15} />
        </Button>
      </Link>
      <div className="mt-6 flex-1 space-y-2.5">
        {features.map((feature, i) => (
          <div key={i} className="flex items-start gap-2">
            <Check
              className={`mt-0.5 size-4 shrink-0 ${
                highlighted ? "text-emerald-300" : "text-emerald-400"
              }`}
            />
            <span className="text-sm text-zinc-400">{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
