export const COMMENTARY_FEED_SCROLL_CLASS = "panel-scroll px-2 pb-2 space-y-1";

export const COMMENTARY_GROUP_CLASS =
  "overflow-hidden rounded border border-panel bg-surface/80";

export const COMMENTARY_GROUP_HEADER_CLASS =
  "sticky top-0 z-10 border-b border-panel bg-track px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none";

export const COMMENTARY_GROUP_ITEMS_CLASS = "divide-y divide-panel";

export const COMMENTARY_ROW_CLASS =
  "relative flex items-start gap-3 px-2 py-2.5 text-left transition-colors hover:bg-white/[0.04]";

export const COMMENTARY_TIME_CLASS =
  "w-14 shrink-0 self-center whitespace-nowrap pl-2 pr-2 text-[10px] font-mono tabular-nums text-muted";

export const COMMENTARY_TITLE_CLASS = "truncate text-[11px] font-bold text-white/90";

export const COMMENTARY_META_CLASS =
  "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted";

export const COMMENTARY_BADGE_CLASS =
  "inline-flex h-5 w-fit max-w-full shrink-0 items-center justify-center rounded px-1.5 whitespace-nowrap text-center text-[8px] font-black uppercase tracking-widest leading-none";

export const COMMENTARY_CHEVRON_CLASS = "shrink-0 text-[10px] text-muted";

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
