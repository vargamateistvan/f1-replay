import { AppLogo } from "@/components/AppLogo";

interface AppCrashProps {
  message?: string;
  onRetry?: () => void;
}

export default function AppCrash({
  message = "Unexpected runtime error",
  onRetry,
}: AppCrashProps) {
  return (
    <section className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-track px-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.23),_transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative z-10 flex max-w-xl flex-col items-center gap-5 rounded-2xl border border-[#363646] bg-surface/80 px-6 py-8 shadow-[0_30px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="rounded-2xl border border-[#404055] bg-track/60 p-3">
          <AppLogo size={36} />
        </div>

        <p className="text-f1red text-xs font-mono uppercase tracking-[0.28em]">
          Application Error
        </p>
        <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">
          Safety Car Deployed
        </h1>
        <p className="max-w-md text-sm text-muted sm:text-base">
          Something went wrong and the app had to stop this run.
        </p>

        <div className="w-full rounded-lg border border-[#4a2832] bg-[#2b1a20] px-3 py-2 text-left text-xs font-mono text-red-300 sm:text-sm">
          {message}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            onClick={onRetry}
            className="rounded-md bg-f1red px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600"
          >
            Try Again
          </button>
          <a
            href="/"
            className="rounded-md border border-panel bg-track px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-f1red hover:text-f1red"
          >
            Go to Home
          </a>
        </div>
      </div>
    </section>
  );
}
