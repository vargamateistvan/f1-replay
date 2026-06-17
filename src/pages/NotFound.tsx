import { Link } from "react-router-dom";
import { AppLogo } from "@/components/AppLogo";

export default function NotFound() {
  return (
    <section className="relative flex h-full min-h-[55vh] flex-col items-center justify-center overflow-hidden bg-track px-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.2),_transparent_56%)]" />
      <div className="relative z-10 flex max-w-xl flex-col items-center gap-5">
        <div className="rounded-2xl border border-[#373748] bg-surface/70 p-3 shadow-[0_20px_55px_rgba(0,0,0,0.35)]">
          <AppLogo size={34} />
        </div>
        <p className="text-f1red text-xs font-mono uppercase tracking-[0.28em]">
          Error 404
        </p>
        <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">
          Track Not Found
        </h1>
        <p className="max-w-md text-sm text-muted sm:text-base">
          This route does not exist. The race control feed has no data for this
          page.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            to="/"
            className="rounded-md bg-f1red px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600"
          >
            Back to Home
          </Link>
          <Link
            to="/telemetry"
            className="rounded-md border border-panel bg-surface px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-f1red hover:text-f1red"
          >
            Open Telemetry
          </Link>
        </div>
      </div>
    </section>
  );
}
