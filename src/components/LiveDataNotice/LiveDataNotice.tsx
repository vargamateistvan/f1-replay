import { isAuthError } from "@/api/client";

interface Props {
  readonly error: unknown;
}

export function LiveDataNotice({ error }: Props) {
  if (!isAuthError(error)) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-400/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100"
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
    </div>
  );
}
