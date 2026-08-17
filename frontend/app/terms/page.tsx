import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Pathayo",
  description:
    "The terms and conditions that govern your use of Pathayo and the CloseLoop AI agent.",
};

const LAST_UPDATED = "August 17, 2026";

export default function TermsOfService() {
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
        <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-10 text-sm leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Acceptance of Terms</h2>
            <p className="mt-3">
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to
              and use of Pathayo, including the website at{" "}
              <a
                href="https://pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                pathayo.com
              </a>{" "}
              and the CloseLoop AI agent (together, the
              &ldquo;Service&rdquo;). By creating an account or otherwise using
              the Service, you agree to be bound by these Terms. If you do not
              agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Eligibility</h2>
            <p className="mt-3">
              You must be at least 16 years old and able to form a binding
              contract to use the Service. If you are using the Service on
              behalf of an organization, you represent that you have authority
              to bind that organization.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Accounts</h2>
            <p className="mt-3">
              You are responsible for maintaining the confidentiality of your
              credentials and for all activity that occurs under your account.
              Notify us promptly at{" "}
              <a
                href="mailto:support@mail.pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                support@mail.pathayo.com
              </a>{" "}
              of any unauthorized use. We may suspend or terminate accounts that
              violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Acceptable Use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Use the Service to process meetings you do not have consent to record.</li>
              <li>Upload content that is unlawful, infringing, or harmful.</li>
              <li>Attempt to access another workspace&apos;s data or reverse engineer the Service.</li>
              <li>Abuse, overload, or disrupt the Service or its subprocessors.</li>
              <li>Use the Service to send spam or unsolicited communications.</li>
              <li>Resell or sublicense access without our written consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Meeting Recording Consent</h2>
            <p className="mt-3">
              You are responsible for complying with applicable recording and
              consent laws (including two-party consent jurisdictions) before
              inviting the CloseLoop agent to a meeting. Pathayo provides a
              visible bot indicator and disclosure, but obtaining participant
              consent is your responsibility. Pathayo is not liable for
              unauthorized recordings made by users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Subscriptions and Billing</h2>
            <p className="mt-3">
              Paid plans are billed in advance on a recurring basis until
              cancelled. Fees are non-refundable except where required by law.
              You can cancel anytime from the product or by emailing{" "}
              <a
                href="mailto:payment@mail.pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                payment@mail.pathayo.com
              </a>
              . We may change pricing with at least 30 days&apos; notice;
              existing subscriptions continue at the prior rate until renewal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Free Trial and Plans</h2>
            <p className="mt-3">
              If we offer a free trial or free tier, it is subject to usage
              limits and may be modified or discontinued at any time. We may
              limit trials to one per organization or per user.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Intellectual Property</h2>
            <p className="mt-3">
              Pathayo retains all rights, title, and interest in the Service,
              including software, designs, brand names, and documentation. You
              retain all rights to the content you upload (transcripts,
              meeting data, workspace configuration). We receive a limited,
              non-exclusive license to process your content solely to operate
              and improve the Service for you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. AI Output</h2>
            <p className="mt-3">
              The CloseLoop agent generates extracted decisions, tasks, and
              summaries using AI. Output may be incomplete or inaccurate. You
              are responsible for reviewing AI output before relying on it.
              Pathayo does not guarantee the accuracy of any AI-generated
              content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">10. Integrations</h2>
            <p className="mt-3">
              The Service integrates with third-party tools (GitHub, Slack,
              Jira, Linear, Google Calendar, Recall.ai). These integrations are
              governed by the third party&apos;s own terms and may be suspended
              or changed by them. Pathayo is not responsible for the
              availability or behavior of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">11. Disclaimers</h2>
            <p className="mt-3">
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo; without warranties of any kind, whether express
              or implied, including merchantability, fitness for a particular
              purpose, or non-infringement. We do not warrant that the Service
              will be uninterrupted, error-free, or secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">12. Limitation of Liability</h2>
            <p className="mt-3">
              To the maximum extent permitted by law, Pathayo and its
              affiliates shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of
              profits or data, arising out of or related to the Service,
              whether in contract, tort, or otherwise. Our total aggregate
              liability shall not exceed the amount you paid us in the 12
              months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">13. Indemnification</h2>
            <p className="mt-3">
              You agree to indemnify and hold Pathayo harmless from any claims,
              damages, or expenses arising out of your content, your violation
              of these Terms, or your violation of any third-party rights
              (including recording consent laws).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">14. Termination</h2>
            <p className="mt-3">
              You may terminate your account at any time. We may suspend or
              terminate your access if you violate these Terms, create legal
              risk, or fail to pay fees. Upon termination, your right to use
              the Service ends immediately. Sections that by their nature
              should survive termination (including intellectual property,
              disclaimers, limitation of liability, and governing law) will
              remain in effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">15. Governing Law and Disputes</h2>
            <p className="mt-3">
              These Terms are governed by the laws of India without regard to
              conflict-of-laws principles. The courts of Bengaluru, India shall
              have exclusive jurisdiction over any disputes, except that
              Pathayo may seek injunctive relief in any court of competent
              jurisdiction to protect its intellectual property. Before
              filing a claim, you agree to attempt good-faith resolution by
              contacting us at{" "}
              <a
                href="mailto:support@mail.pathayo.com"
                className="text-emerald-300 hover:underline"
              >
                support@mail.pathayo.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">16. Changes to These Terms</h2>
            <p className="mt-3">
              We may modify these Terms from time to time. Material changes
              will be notified by email or in-product banner at least 7 days
              before they take effect. Continued use after the effective date
              constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">17. Entire Agreement</h2>
            <p className="mt-3">
              These Terms, together with the Privacy Policy and any plan-specific
              terms, constitute the entire agreement between you and Pathayo
              regarding the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">18. Contact</h2>
            <p className="mt-3">
              Questions about these Terms can be sent to{" "}
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
              <Link href="/privacy" className="transition hover:text-emerald-300">
                Privacy Policy
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
