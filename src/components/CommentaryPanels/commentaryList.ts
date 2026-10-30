import { buttonClass } from "@/components/Button/buttonClass";
// Commentary feed styling, aligned with the Settings / Catch-up design language:
// square edges, panel-coloured dividers, a thin left accent per row, mono times.

export const COMMENTARY_FEED_SCROLL_CLASS = "panel-scroll px-2 pb-2 space-y-2";

export const COMMENTARY_GROUP_CLASS = "border border-panel bg-surface";

export const COMMENTARY_GROUP_HEADER_CLASS =
  "sticky top-0 z-10 flex items-center gap-2 border-b border-panel bg-track px-3 py-1.5 text-caption font-black uppercase leading-none tracking-eyebrow text-fg select-none before:h-2.5 before:w-0.5 before:shrink-0 before:bg-f1red before:content-['']";

export const COMMENTARY_GROUP_ITEMS_CLASS = "divide-y divide-panel";

export const COMMENTARY_ROW_CLASS =
  "group/commentary relative flex items-start gap-3 py-2.5 pl-4 pr-3 text-left transition-colors hover:bg-fg/[0.04]";

/** Left accent strip; colour (or flag pattern) comes from an inline style. */
export const COMMENTARY_ACCENT_CLASS = "absolute inset-y-0 left-0 w-0.5";

export const COMMENTARY_TIME_CLASS =
  "whitespace-nowrap font-mono text-small leading-4 tabular-nums text-fg/60";

export const COMMENTARY_TITLE_CLASS =
  "truncate text-compact font-semibold leading-4 text-fg/90";

export const COMMENTARY_META_CLASS =
  "mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-caption leading-4 tabular-nums text-muted";

export const COMMENTARY_BADGE_CLASS =
  "inline-flex h-4 w-fit max-w-full shrink-0 items-center justify-center whitespace-nowrap px-1.5 text-center text-micro font-black uppercase leading-none tracking-widest";

/** Secondary square action (CSV export, load older, play). */
export const COMMENTARY_BUTTON_CLASS = buttonClass("quiet", "sm");

/** Primary square action (replay a window). */
export const COMMENTARY_PRIMARY_BUTTON_CLASS = buttonClass("primary", "sm");

/** Filter / search strip above a feed. */
export const COMMENTARY_TOOLBAR_CLASS =
  "flex flex-wrap items-center gap-1.5 border border-panel bg-surface px-2 py-2";

export const COMMENTARY_SEARCH_CLASS =
  "h-7 w-28 min-w-0 border border-panel bg-track px-2 text-small text-fg placeholder:text-muted outline-none transition-colors focus:border-f1red/70 sm:w-32";

export const COMMENTARY_EMPTY_CLASS =
  "px-3 py-6 text-center text-small leading-snug text-muted";

export function formatSessionElapsedTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

export function commentaryGroupLabel(
  sessionType: string | undefined,
  lapNumber: number | null,
): string {
  const isQualifying = sessionType?.toLowerCase().includes("qualifying");
  if (isQualifying && lapNumber !== null) return `Q${lapNumber}`;
  if (lapNumber !== null) return `Lap ${lapNumber}`;
  return "Session";
}
