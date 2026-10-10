import { ChevronRight } from "lucide-react";
import { formatSessionElapsedTime } from "@/components/CommentaryPanels/commentaryList";

export const COMMENTARY_JUMP_BUTTON_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded bg-panel text-muted transition-colors hover:bg-track hover:text-white";

type Props = Readonly<{
  /** Session-relative ms of the event. */
  ms: number;
  /** What the row describes, for the accessible name ("Jump to <label> at 12:34"). */
  label: string;
  onJump: (ms: number) => void;
}>;

/** Per-row link button that seeks the playhead to a commentary item. */
export function CommentaryJumpButton({ ms, label, onJump }: Props) {
  const target = Math.max(0, ms);
  const name = `Jump to ${label} at ${formatSessionElapsedTime(target)}`;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onJump(target);
      }}
      className={COMMENTARY_JUMP_BUTTON_CLASS}
      aria-label={name}
      title={name}
    >
      <ChevronRight size={11} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
