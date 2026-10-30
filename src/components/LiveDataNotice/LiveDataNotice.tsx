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
      className="relative border-b border-orange-line bg-orange-tint py-2 pl-4 pr-10 text-center text-xs text-fg/90"
    >
      <span className="font-bold">Live data is currently unavailable.</span>{" "}
      <a
        href="https://openf1.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-orange-fg underline decoration-orange-fg/60 underline-offset-2 hover:text-fg"
      >
        OpenF1
      </a>{" "}
      requires paid access for live timing.{" "}
      <a
        href="https://buymeacoffee.com/matt_varga"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-orange-fg underline decoration-orange-fg/60 underline-offset-2 hover:text-fg"
      >
        Support F1 Replay to help bring live data to the project.
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss live data notice"
        title="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-sm text-orange-fg hover:bg-orange/20 hover:text-fg transition-colors"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
