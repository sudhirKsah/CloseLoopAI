import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Pathayo",
  description:
    "How Pathayo collects, uses, and protects your data when you use our AI meeting and execution tracking platform.",
};

const LAST_UPDATED = "August 17, 2026";

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-300 font-black text-zinc-950">
              P
            </span>
            Pathayo
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-400 transition hover:text-white"
          >
            Back to home
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-10 text-sm leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Overview</h2>
            <p className="mt-3">
              Pathayo (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
              operates the platform at{" "}
              <a
                href="https://pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                pathayo.com
              </a>{" "}
              and the associated CloseLoop AI agent. This Privacy Policy explains
              what information we collect, how we use it, and the choices you
              have. By using Pathayo, you agree to the practices described here.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>
            <h3 className="mt-5 font-medium text-zinc-200">Account information</h3>
            <p className="mt-2">
              When you sign up we collect your name, email address, and a
              password (stored as a salted hash). We also store workspace names
              and member assignments you create.
            </p>
            <h3 className="mt-5 font-medium text-zinc-200">Meeting content</h3>
            <p className="mt-2">
              When you invite the CloseLoop agent to a meeting, we receive the
              meeting URL, transcript, and metadata from Recall.ai. The
              transcript is processed by an LLM to extract decisions, tasks,
              owners, and risks. The transcript and derived items are stored in
              your workspace and may be retained for the lifetime of your
              account unless you delete them.
            </p>
            <h3 className="mt-5 font-medium text-zinc-200">Integration data</h3>
            <p className="mt-2">
              If you connect GitHub, Slack, Jira, Linear, or Google Calendar, we
              receive OAuth tokens and the activity data those services expose
              (commits, PRs, messages, tickets, events). Tokens are encrypted at
              rest and scoped to the minimum permissions required.
            </p>
            <h3 className="mt-5 font-medium text-zinc-200">Usage and technical data</h3>
            <p className="mt-2">
              We collect server logs, IP addresses, browser type, and product
              usage events needed to operate, secure, and improve the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. How We Use Information</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>To provide the meeting capture, extraction, and tracking features.</li>
              <li>To send nudges, escalation alerts, reports, and account emails.</li>
              <li>To synchronize your workspace data with connected integrations.</li>
              <li>To maintain a per-workspace knowledge graph memory used by the AI agent.</li>
              <li>To detect abuse, secure the platform, and comply with legal obligations.</li>
              <li>To analyze aggregate usage and improve product quality.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. AI Processing</h2>
            <p className="mt-3">
              Transcripts and workspace context are processed by third-party LLM
              providers (such as Google Gemini, OpenAI, and Cerebras) to extract
              structured information and generate reports. These providers may
              retain transient request data according to their own policies. We
              do not sell your data to any third party, including AI providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Data Storage and Security</h2>
            <p className="mt-3">
              Data is stored in encrypted PostgreSQL databases (Neon), with
              caching in Redis (Upstash) and graph data in FalkorDB. All
              connections use TLS. Integration credentials are encrypted at rest
              with a dedicated encryption key. Access to production
              infrastructure is restricted to authorized personnel and audited.
            </p>
            <p className="mt-3">
              Each workspace is isolated: knowledge graph memory, integration
              tokens, and meeting data are scoped to your workspace and are not
              shared across workspaces.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Data Retention</h2>
            <p className="mt-3">
              We retain your data for as long as your account is active. You can
              delete individual meetings, tasks, or your entire workspace at any
              time from the product. When you delete a workspace, we remove the
              associated meeting content, extracted items, integration tokens,
              and knowledge graph memory within 30 days. Server logs are
              retained for up to 90 days for security and debugging.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Your Rights</h2>
            <p className="mt-3">
              You can access, export, correct, or delete your personal data from
              within the product or by emailing{" "}
              <a
                href="mailto:support@mail.pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                support@mail.pathayo.com
              </a>
              . Depending on your jurisdiction (GDPR, CCPA, DPDP Act 2023,
              etc.) you may have additional rights including the right to
              object to processing, restrict processing, and lodge a complaint
              with a supervisory authority.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Cookies and Local Storage</h2>
            <p className="mt-3">
              Pathayo uses a first-party authentication cookie and local storage
              to keep you signed in and remember your selected workspace. We do
              not use third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Sharing and Subprocessors</h2>
            <p className="mt-3">
              We share data only with subprocessors that help us run the
              platform: Google Cloud Platform (hosting), Neon (PostgreSQL),
              Upstash (Redis), Recall.ai (meeting capture), Google Gemini /
              OpenAI / Cerebras (LLM inference), Clerk (authentication), and
              Razorpay (payments). Each subprocessor is bound by data
              processing agreements. We never sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">10. Children&apos;s Privacy</h2>
            <p className="mt-3">
              Pathayo is not directed to children under 16 and we do not
              knowingly collect their data. If you believe a child has signed
              up, contact us and we will remove the account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">11. International Transfers</h2>
            <p className="mt-3">
              Your data may be processed in the United States, the European
              Union, and India depending on the subprocessor. We rely on
              Standard Contractual Clauses and equivalent safeguards for
              cross-border transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">12. Changes to This Policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. Material
              changes will be notified by email or in-product banner at least 7
              days before they take effect. The &ldquo;Last updated&rdquo; date
              above always reflects the current version.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">13. Contact</h2>
            <p className="mt-3">
              Questions about this policy or your data can be sent to{" "}
              <a
                href="mailto:support@mail.pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                support@mail.pathayo.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-16 border-t border-white/[.06] pt-6 text-xs text-zinc-600">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span>© 2026 Pathayo. All rights reserved.</span>
            <div className="flex gap-4">
              <Link href="/terms" className="transition hover:text-emerald-300">
                Terms of Service
              </Link>
              <Link href="/" className="transition hover:text-emerald-300">
                Home
              </Link>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
