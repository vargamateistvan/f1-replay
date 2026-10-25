import { Link } from "react-router-dom";

export default function Privacy() {
  const updatedOn = "2026-10-25";

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-track px-4 py-5 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.16),_transparent_58%)]" />

      <article className="relative z-10 mx-auto my-auto w-full max-w-4xl shrink-0 border border-panel bg-surface">
        <div className="flex h-7 items-center justify-between bg-f1red px-4 text-white">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">
            Legal
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider">
            Privacy
          </span>
        </div>

        <div className="p-5 sm:p-8">
          <header className="border-b border-panel pb-5">
            <h1 className="text-2xl font-black uppercase leading-tight tracking-[0.06em] text-white sm:text-3xl">
              Privacy Policy
            </h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Last updated <span className="text-white/80">{updatedOn}</span>
            </p>
          </header>

          <p className="my-5 max-w-3xl text-sm leading-6 text-white/90">
            F1 Replay uses analytics and session replay to understand site
            usage, improve the app, and investigate usability issues. This
            policy summarizes the information these tools may process.
          </p>

          <div className="divide-y divide-panel border-y border-panel">
            <section className="border-l-2 border-f1red/70 py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                What We Collect
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              We may process technical and usage data such as page views,
              browser and device metadata, referral information, and
              interactions with the app. Analytics events include the current
              route and app context, such as the selected season, event, and
              session where available. We do not intentionally include
              sensitive personal data in analytics events.
              </p>
              <p className="mt-2 text-sm leading-6 text-white/80">
              In production, Amplitude Session Replay is configured to sample
              10% of sessions. A replay can reconstruct visible page content
              and interactions, including clicks, scrolling, and navigation.
              Amplitude's medium masking level masks form fields and text
              inputs; other visible page text may be captured. You can disable
              future recordings in Settings. The Amplitude project privacy
              settings may apply additional masking or override SDK settings.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Cookies and Consent
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              We use Google Analytics and Amplitude for measurement. Analytics
              and replay are enabled on production sites; Session Replay is
              configured for a 10% sample. You can turn off future Session
              Replay recordings in{" "}
              <strong>Settings → General → Session replay</strong>. This app
              does not currently provide a separate consent banner;
              requirements vary by location, so this notice is not a
              determination that consent is unnecessary.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Third Parties
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              Analytics and replay data may be processed by Google and
              Amplitude under their respective terms and privacy policies.
              Review their policies for information about their processing and
              retention practices.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Contact
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              For privacy inquiries, contact: security@f1replay.app
              </p>
            </section>
          </div>

          <p className="mt-4 text-[10px] leading-5 text-muted">
            This page is a general summary and not legal advice.
          </p>

          <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-panel pt-4">
            <Link
              to="/terms"
              className="border border-panel px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:border-f1red hover:text-f1red"
            >
              Terms of Service
            </Link>
            <Link
              to="/"
              className="bg-f1red px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-600"
            >
              Back to Replay
            </Link>
          </footer>
        </div>
      </article>
    </section>
  );
}
