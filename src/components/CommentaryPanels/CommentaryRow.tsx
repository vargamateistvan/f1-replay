import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Driver } from "@/api/types";
import { teamColor } from "@/utils/color";
import {
  COMMENTARY_ACCENT_CLASS,
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_META_CLASS,
  COMMENTARY_ROW_CLASS,
  COMMENTARY_TIME_CLASS,
  COMMENTARY_TITLE_CLASS,
  formatSessionElapsedTime,
} from "@/components/CommentaryPanels/commentaryList";
import {
  COMMENTARY_JUMP_BUTTON_CLASS,
  CommentaryJumpButton,
} from "@/components/CommentaryPanels/CommentaryJumpButton";

export type CommentaryBadge = Readonly<{
  label: string;
  /** Tailwind colour classes. */
  className?: string;
  /** Inline colours (team / flag colours that aren't Tailwind tokens). */
  style?: CSSProperties;
}>;

type Props = Readonly<{
  /** Session-relative ms of the item. */
  ms: number;
  badge: CommentaryBadge;
  title: ReactNode;
  /** Secondary mono line under the title. */
  meta?: ReactNode;
  /** Extra content under the meta line (battle lines, inline cards). */
  children?: ReactNode;
  /** Left accent strip: a colour, or a style for patterned flags. */
  accent?: string | CSSProperties | null;
  /** Row-level buttons shown before the jump button. */
  actions?: ReactNode;
  /** Accessible name of what the row describes ("Jump to <label> at …"). */
  jumpLabel?: string;
  /** Full accessible name for the jump button, replacing the default wording. */
  jumpName?: string;
  onJump?: (ms: number) => void;
  /** The whole row seeks on click (no separate jump button). */
  rowClickable?: boolean;
  /** After the playhead — only visible in "All" mode. */
  upcoming?: boolean;
  /** The chapter / item currently in progress. */
  active?: boolean;
  /** Title lines before truncating: 2 for long RC messages, "all" to never clip. */
  titleLines?: 1 | 2 | "all";
  className?: string;
}>;

/** One commentary feed item: time + type badge, title + meta, actions. */
export function CommentaryRow({
  ms,
  badge,
  title,
  meta,
  children,
  accent,
  actions,
  jumpLabel,
  jumpName,
  onJump,
  rowClickable = false,
  upcoming = false,
  active = false,
  titleLines = 1,
  className = "",
}: Props) {
  const accentStyle =
    typeof accent === "string" ? { backgroundColor: accent } : accent;
  const rowClass = [
    COMMENTARY_ROW_CLASS,
    rowClickable ? "w-full cursor-pointer" : "",
    active ? "bg-fg/[0.04]" : "",
    upcoming ? "opacity-50" : "",
    className,
  ].join(" ");

  const content = (
    <>
      {accentStyle && (
        <span
          aria-hidden="true"
          data-commentary-accent=""
          className={COMMENTARY_ACCENT_CLASS}
          style={accentStyle}
        />
      )}
      <span className="flex min-w-[4.75rem] shrink-0 flex-col items-start gap-1">
        <span className={COMMENTARY_TIME_CLASS}>
          {formatSessionElapsedTime(Math.max(0, ms))}
        </span>
        <span
          data-commentary-badge=""
          className={`${COMMENTARY_BADGE_CLASS} ${badge.className ?? ""}`}
          style={badge.style}
        >
          {badge.label}
        </span>
      </span>
      <span className="block min-w-0 flex-1">
        <span
          className={`${TITLE_CLASS_BY_LINES[titleLines]} block`}
        >
          {title}
        </span>
        {meta && (
          <span data-commentary-meta="" className={COMMENTARY_META_CLASS}>
            {meta}
          </span>
        )}
        {children}
      </span>
      {(actions || onJump) && (
        <span className="flex shrink-0 items-center gap-1.5 self-center">
          {actions}
          {onJump &&
            (rowClickable ? (
              <span aria-hidden="true" className={COMMENTARY_JUMP_BUTTON_CLASS}>
                <ChevronRight size={11} strokeWidth={2.4} />
              </span>
            ) : (
              <CommentaryJumpButton
                ms={ms}
                label={jumpLabel ?? "item"}
                name={jumpName}
                onJump={onJump}
              />
            ))}
        </span>
      )}
    </>
  );

  if (rowClickable && onJump) {
    return (
      <button
        type="button"
        data-commentary-row=""
        onClick={() => onJump(Math.max(0, ms))}
        className={rowClass}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-commentary-row="" className={rowClass}>
      {content}
    </div>
  );
}

const TITLE_CLASS_BY_LINES = {
  1: COMMENTARY_TITLE_CLASS,
  2: "line-clamp-2 text-compact font-semibold leading-4 text-fg/90",
  all: "text-compact font-semibold leading-4 text-fg/90",
} as const;

/** Team-coloured driver code, optionally followed by the muted full name. */
export function CommentaryDriver({
  driver,
  driverNumber,
  showName = false,
}: Readonly<{ driver?: Driver; driverNumber: number; showName?: boolean }>) {
  return (
    <>
      <span
        className="font-black tracking-wide"
        style={{ color: teamColor(driver?.team_colour) }}
      >
        {driver?.name_acronym ?? driverNumber}
      </span>
      {showName && driver?.full_name && (
        <span className="ml-1.5 font-normal text-muted">{driver.full_name}</span>
      )}
    </>
  );
}
