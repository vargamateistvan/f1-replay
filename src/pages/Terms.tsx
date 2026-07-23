import { Link } from "react-router-dom";

export default function Terms() {
  const updatedOn = "2026-06-20";

  return (
    <section className="relative flex h-full min-h-[55vh] flex-col overflow-hidden bg-track px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.16),_transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-4xl rounded-2xl border border-panel bg-surface/80 p-5 shadow-[0_20px_55px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-f1red text-[11px] font-mono uppercase tracking-[0.24em]">
          Legal
        </p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: {updatedOn}</p>

        <div className="mt-6 space-y-5 text-sm leading-6 text-white/90">
          <p>
            By using F1 Replay, you agree to these terms. If you do not agree,
            please stop using the service.
          </p>

          <div>
            <h2 className="text-base font-bold text-white">Use of Service</h2>
            <p className="mt-2">
              You may use the app for lawful, personal, or internal business
              purposes. You agree not to abuse, disrupt, or reverse engineer the
              service in a way that harms its availability.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">Data Sources</h2>
            <p className="mt-2">
              The platform displays motorsport data from third-party sources.
              Data may be delayed, incomplete, or inaccurate at times.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">No Warranty</h2>
            <p className="mt-2">
              The service is provided on an "as is" and "as available" basis
              without warranties of any kind.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              Limitation of Liability
            </h2>
            <p className="mt-2">
              To the maximum extent permitted by law, F1 Replay is not liable
              for indirect, incidental, or consequential damages arising from
              your use of the service.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">Contact</h2>
            <p className="mt-2">
              For legal questions, contact: security@f1replay.app
            </p>
          </div>

          <p className="text-xs text-muted">
            This page is a basic template and not legal advice.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/privacy"
            className="rounded-md border border-panel bg-track px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:border-f1red hover:text-f1red"
          >
            Privacy Policy
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
