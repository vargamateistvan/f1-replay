import { Link } from "react-router-dom";

export default function Privacy() {
  const updatedOn = "2026-06-20";

  return (
    <section className="relative flex h-full min-h-[55vh] flex-col overflow-hidden bg-track px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.16),_transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-4xl rounded-2xl border border-panel bg-surface/80 p-5 shadow-[0_20px_55px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-f1red text-[11px] font-mono uppercase tracking-[0.24em]">
          Legal
        </p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: {updatedOn}</p>

        <div className="mt-6 space-y-5 text-sm leading-6 text-white/90">
          <p>
            F1 Replay uses analytics and consent tooling to understand site
            usage and improve reliability. This policy explains what data is
            processed at a high level.
          </p>

          <div>
            <h2 className="text-base font-bold text-white">What We Collect</h2>
            <p className="mt-2">
              We may process technical and usage data such as page views,
              browser and device metadata, referrer URLs, and interaction
              events. We do not intentionally collect sensitive personal data
              through analytics events.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              Cookies and Consent
            </h2>
            <p className="mt-2">
              We use Cookiebot for consent management and Google tools for
              measurement. Non-essential storage and analytics are controlled by
              your consent preferences.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">Third Parties</h2>
            <p className="mt-2">
              Data may be processed by third-party providers such as Google and
              Cookiebot in accordance with their terms and privacy policies.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">Contact</h2>
            <p className="mt-2">
              For privacy inquiries, contact: security@f1replay.app
            </p>
          </div>

          <p className="text-xs text-muted">
            This page is a general summary and not legal advice.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/terms"
            className="rounded-md border border-panel bg-track px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:border-f1red hover:text-f1red"
          >
            Terms of Service
          </Link>
          <Link
            to="/"
            className="rounded-md bg-f1red px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-600"
          >
            Back to Replay
          </Link>
        </div>
      </div>
    </section>
  );
}
