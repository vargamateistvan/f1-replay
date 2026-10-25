import { Link } from "react-router-dom";

export default function Privacy() {
  const updatedOn = "2026-10-25";

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
            F1 Replay uses analytics and session replay to understand site
            usage, improve the app, and investigate usability issues. This
            policy summarizes the information these tools may process.
          </p>

          <div>
            <h2 className="text-base font-bold text-white">What We Collect</h2>
            <p className="mt-2">
              We may process technical and usage data such as page views,
              browser and device metadata, referral information, and
              interactions with the app. Analytics events include the current
              route and app context, such as the selected season, event, and
              session where available. We do not intentionally include
              sensitive personal data in analytics events.
            </p>
            <p className="mt-2">
              In production, Amplitude Session Replay is configured to sample
              10% of sessions. A replay can reconstruct visible page content
              and interactions, including clicks, scrolling, and navigation.
              Amplitude's medium masking level masks form fields and text
              inputs; other visible page text may be captured. You can disable
              future recordings in Settings. The Amplitude project privacy
              settings may apply additional masking or override SDK settings.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              Cookies and Consent
            </h2>
            <p className="mt-2">
              We use Google Analytics and Amplitude for measurement. Analytics
              and replay are enabled on production sites; Session Replay is
              configured for a 10% sample. You can turn off future Session
              Replay recordings in{" "}
              <strong>Settings → General → Session replay</strong>. This app
              does not currently provide a separate consent banner;
              requirements vary by location, so this notice is not a
              determination that consent is unnecessary.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">Third Parties</h2>
            <p className="mt-2">
              Analytics and replay data may be processed by Google and
              Amplitude under their respective terms and privacy policies.
              Review their policies for information about their processing and
              retention practices.
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
