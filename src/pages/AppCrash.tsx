import { AppLogo } from "@/components/AppLogo";

interface AppCrashProps {
  message?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}

export default function AppCrash({
  message = "Unexpected runtime error",
  onRetry,
  onGoHome,
}: Readonly<AppCrashProps>) {
  return (
    <section className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-track px-4 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,166,35,0.16),_transparent_58%)]" />

      <div className="relative z-10 flex w-full max-w-xl flex-col border border-panel bg-surface">
        {/* Same strip as the in-session Safety Car flag banner. */}
        <div className="flex h-7 items-center justify-center bg-flag-sc px-4 text-black">
          <span className="text-xs font-black uppercase tracking-[0.25em]">
            Application Error
          </span>
        </div>

        <div className="flex flex-col items-center gap-5 px-6 py-8">
          <div className="border border-panel bg-track p-3">
            <AppLogo size={36} />
          </div>

          <h1 className="text-2xl font-black uppercase leading-tight tracking-[0.1em] text-white sm:text-3xl">
            Safety Car Deployed
          </h1>
          <p className="max-w-md text-sm font-medium text-muted">
            Something went wrong and the app had to stop this run.
          </p>

          <div className="w-full border border-f1red/40 border-l-2 border-l-f1red bg-f1red/10 px-3 py-2 text-left font-mono text-xs text-[#ff5c77] sm:text-sm">
            {message}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onRetry}
              className="bg-f1red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-600"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="border border-panel px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:border-f1red hover:text-f1red"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
