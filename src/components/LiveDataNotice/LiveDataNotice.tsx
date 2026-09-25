import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { isAuthError } from "@/api/client";
import { dismiss, getDismissed, subscribe } from "./dismissal";

interface Props {
  readonly error: unknown;
}

export function LiveDataNotice({ error }: Props) {
  const isDismissed = useSyncExternalStore(
    subscribe,
    getDismissed,
    getDismissed,
  );
  if (isDismissed || !isAuthError(error)) return null;

  return (
    <div
      role="alert"
      className="relative border-b border-amber-400/40 bg-amber-500/10 py-2 pl-4 pr-10 text-center text-xs text-amber-100"
    >
      <span className="font-bold">Live data is currently unavailable.</span>{" "}
      <a
        href="https://openf1.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-amber-300 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-200"
      >
        OpenF1
      </a>{" "}
      requires paid access for live timing.{" "}
      <a
        href="https://buymeacoffee.com/matt_varga"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-amber-300 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-200"
      >
        Support F1 Replay to help bring live data to the project.
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss live data notice"
        title="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-amber-200 hover:bg-amber-500/20 hover:text-white transition-colors"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
