import { Link } from "react-router-dom";
import { AppLogo } from "@/components/AppLogo";

export default function NotFound() {
  return (
    <section className="relative flex h-full min-h-[55vh] flex-col items-center justify-center overflow-hidden bg-track px-4 py-8 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.16),_transparent_56%)]" />

      <div className="relative z-10 flex w-full max-w-xl flex-col border border-panel bg-surface">
        {/* Same strip as the in-session red flag banner. */}
        <div className="flex h-7 items-center justify-center bg-f1red px-4 text-white">
          <span className="text-xs font-black uppercase tracking-[0.25em]">
            Error 404
          </span>
        </div>

        <div className="flex flex-col items-center gap-5 px-6 py-8">
          <div className="border border-panel bg-track p-3">
            <AppLogo size={34} />
          </div>

          <h1 className="text-2xl font-black uppercase leading-tight tracking-[0.1em] text-white sm:text-3xl">
            Track Not Found
          </h1>
          <p className="max-w-md text-sm font-medium text-muted">
            This route does not exist. The race control feed has no data for
            this page.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link
              to="/"
              className="bg-f1red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-600"
            >
              Back to Home
            </Link>
            <Link
              to="/telemetry"
              className="border border-panel px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:border-f1red hover:text-f1red"
            >
              Open Telemetry
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
