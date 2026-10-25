import { Link } from "react-router-dom";

export default function Terms() {
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
            Terms
          </span>
        </div>

        <div className="p-5 sm:p-8">
          <header className="border-b border-panel pb-5">
            <h1 className="text-2xl font-black uppercase leading-tight tracking-[0.06em] text-white sm:text-3xl">
              Terms of Service
            </h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Last updated <span className="text-white/80">{updatedOn}</span>
            </p>
          </header>

          <p className="my-5 max-w-3xl text-sm leading-6 text-white/90">
            By using F1 Replay, you agree to these terms. If you do not agree,
            please stop using the service.
          </p>

          <div className="divide-y divide-panel border-y border-panel">
            <section className="border-l-2 border-f1red/70 py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Use of Service
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              You may use the app for lawful, personal, or internal business
              purposes. You agree not to abuse, disrupt, or reverse engineer the
              service in a way that harms its availability.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Data Sources
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              The platform displays motorsport data from third-party sources.
              Data may be delayed, incomplete, or inaccurate at times.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Analytics and Session Replay
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              We use third-party analytics services to understand how the
              service is used. On production sites, Amplitude Session Replay is
              configured to record a 10% sample of sessions. Replay may capture
              visible page content and interactions; form fields and text
              inputs are masked using Amplitude's medium masking level. You can
              disable future replay recordings in Settings. Further details
              about data collection and third-party processing are provided in
              our{" "}
              <Link
                to="/privacy"
                className="text-f1red/85 transition-colors hover:text-f1red"
              >
                Privacy Policy
              </Link>
              .
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Formula One Trademarks
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              F1 Replay is an independent, unofficial app. It is not affiliated
              with, endorsed by, or associated with Formula One or any Formula
              One group company. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE
              WORLD CHAMPIONSHIP, GRAND PRIX, and related marks are trademarks
              of Formula One group companies.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                No Warranty
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              The service is provided on an "as is" and "as available" basis
              without warranties of any kind.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Limitation of Liability
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              To the maximum extent permitted by law, F1 Replay is not liable
              for indirect, incidental, or consequential damages arising from
              your use of the service.
              </p>
            </section>

            <section className="border-l-2 border-transparent py-4 pl-4 sm:pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Contact
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/80">
              For legal questions, contact: security@f1replay.app
              </p>
            </section>
          </div>

          <p className="mt-4 text-[10px] leading-5 text-muted">
            This page is a basic template and not legal advice.
          </p>

          <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-panel pt-4">
            <Link
              to="/privacy"
              className="border border-panel px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:border-f1red hover:text-f1red"
            >
              Privacy Policy
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
