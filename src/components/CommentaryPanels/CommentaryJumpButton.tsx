import { ChevronRight } from "lucide-react";
import { formatSessionElapsedTime } from "@/components/CommentaryPanels/commentaryList";

export const COMMENTARY_JUMP_BUTTON_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center border border-panel text-muted transition-colors group-hover/commentary:border-muted group-hover/commentary:text-white hover:!border-f1red hover:bg-f1red hover:!text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-f1red";

type Props = Readonly<{
  /** Session-relative ms of the event. */
  ms: number;
  /** What the row describes, for the accessible name ("Jump to <label> at 12:34"). */
  label: string;
  /** Full accessible name, replacing the "Jump to …" wording. */
  name?: string;
  onJump: (ms: number) => void;
}>;

/** Per-row link button that seeks the playhead to a commentary item. */
export function CommentaryJumpButton({ ms, label, name: nameOverride, onJump }: Props) {
  const target = Math.max(0, ms);
  const name =
    nameOverride ?? `Jump to ${label} at ${formatSessionElapsedTime(target)}`;
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
