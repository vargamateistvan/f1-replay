import { FOCUS_RING } from "@/components/Button/buttonClass";

interface Props {
  readonly showAll: boolean;
  readonly onToggle: () => void;
  readonly allTitle?: string;
}

/** Elapsed / All laps toggle shared by the tracker's lap-based charts. */
export function LapRangeToggle({
  showAll,
  onToggle,
  allTitle = "Showing every lap",
}: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showAll}
      className={`h-5 shrink-0 border px-2 text-tiny font-black uppercase tracking-widest transition-colors ${FOCUS_RING} ${
        showAll
          ? "border-f1red bg-f1red text-white"
          : "border-panel bg-track text-muted hover:text-fg"
      }`}
      title={showAll ? allTitle : "Showing laps run so far"}
    >
      {showAll ? "All" : "Elapsed"}
    </button>
  );
}
