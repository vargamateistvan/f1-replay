import { useMemo } from "react";
import type { RaceControl as RaceControlEntry } from "@/api/types";
import {
  normalizeRaceControl,
  toFlagKey,
  type RaceControlSeverity,
} from "@/timeline/raceControl";

// Visual config per flag value
const FLAG_CONFIG: Record<
  string,
  { label: string; bar: string; text: string }
> = {
  GREEN: { label: "GREEN", bar: "bg-green-600", text: "text-green-300" },
  YELLOW: { label: "YELLOW", bar: "bg-yellow-500", text: "text-yellow-300" },
  DOUBLE_YELLOW: {
    label: "DBL YELLOW",
    bar: "bg-yellow-400",
    text: "text-yellow-200",
  },
  RED: { label: "RED FLAG", bar: "bg-red-600", text: "text-red-300" },
  SAFETY_CAR: {
    label: "SAFETY CAR",
    bar: "bg-yellow-500",
    text: "text-yellow-300",
  },
  VIRTUAL_SC: {
    label: "VIRTUAL SC",
    bar: "bg-yellow-600",
    text: "text-yellow-400",
  },
  CHEQUERED: { label: "CHEQUERED", bar: "bg-white", text: "text-gray-900" },
  BLUE: { label: "BLUE", bar: "bg-blue-500", text: "text-blue-300" },
  BLACK_AND_WHITE: {
    label: "BLK/WHT",
    bar: "bg-gray-400",
    text: "text-gray-200",
  },
  CLEAR: { label: "CLEAR", bar: "bg-green-600", text: "text-green-300" },
};

const DEFAULT_CONFIG = { label: "", bar: "bg-[#2a2a35]", text: "text-muted" };

const SEVERITY_BADGE: Record<
  RaceControlSeverity,
  { label: string; cls: string }
> = {
  info: {
    label: "Info",
    cls: "bg-[#2a2a35] text-gray-300",
  },
  warning: {
    label: "Warn",
    cls: "bg-amber-500/20 text-amber-300",
  },
  critical: {
    label: "Critical",
    cls: "bg-red-500/20 text-red-300",
  },
};

function sectorBadge(entry: RaceControlEntry): string | null {
  if (entry.sector !== null && entry.sector >= 1 && entry.sector <= 3) {
    return `Sector ${entry.sector}`;
  }
  if (entry.scope && entry.scope.trim() !== "") return entry.scope;
  return null;
}

interface Props {
  readonly entries: RaceControlEntry[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

export function RaceControlFeed({
  entries,
  sessionTimeMs,
  sessionStartMs,
}: Props) {
  const normalized = useMemo(
    () => normalizeRaceControl(entries, sessionStartMs),
    [entries, sessionStartMs],
  );

  const visibleEntries = useMemo(
    () => normalized.filter((e) => e.ms <= sessionTimeMs),
    [normalized, sessionTimeMs],
  );

  // Current session flag: last flag-bearing entry
  const currentFlagEntry = useMemo(() => {
    for (let i = visibleEntries.length - 1; i >= 0; i--) {
      const entry = visibleEntries[i]!;
      const flag = entry.flag;
      if (flag && flag !== "") return entry;
    }
    return null;
  }, [visibleEntries]);

  const flagConfig = currentFlagEntry
    ? (FLAG_CONFIG[toFlagKey(currentFlagEntry.flag)] ?? DEFAULT_CONFIG)
    : null;
  const currentSector = currentFlagEntry ? sectorBadge(currentFlagEntry) : null;

  const feed = [...visibleEntries].reverse().slice(0, 30);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Persistent status banner — slim full-width strip */}
      {flagConfig && (
        <div
          className={`flex items-center gap-2 px-3 h-7 ${flagConfig.bar} shrink-0`}
        >
          <span
            className={`font-black text-[10px] tracking-widest uppercase ${flagConfig.text}`}
          >
            {flagConfig.label}
          </span>
          {currentSector && (
            <span className="rounded bg-black/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-inherit">
              {currentSector}
            </span>
          )}
        </div>
      )}

      {/* Scrollable message feed */}
      <div
        className="flex-1 overflow-auto p-2 space-y-1"
        style={{ touchAction: "pan-y" }}
      >
        {feed.length === 0 && (
          <div className="text-muted text-xs">
            {sessionStartMs
              ? "No messages yet — scrub forward"
              : "Select a session"}
          </div>
        )}
        {feed.map((e) => {
          const cfg = FLAG_CONFIG[toFlagKey(e.flag)] ?? DEFAULT_CONFIG;
          const sector = sectorBadge(e);
          const severity = SEVERITY_BADGE[e.severity];
          const typeLabel = e.kind.replace(/_/g, " ");
          return (
            <div
              key={e.id}
              className="flex gap-2 text-xs border-b border-[#2a2a35] pb-1.5 pt-0.5"
            >
              <div className="flex shrink-0 flex-col items-start gap-1">
                {e.flag && (
                  <span
                    className={`font-black text-[10px] uppercase tracking-widest ${cfg.text}`}
                  >
                    {cfg.label || e.flag}
                  </span>
                )}
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${severity.cls}`}
                >
                  {severity.label}
                </span>
                <span className="rounded bg-panel px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted">
                  {typeLabel}
                </span>
                {sector && (
                  <span className="rounded bg-panel px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted">
                    {sector}
                  </span>
                )}
              </div>
              <span className="flex-1 text-white/90 leading-snug text-[11px]">
                {e.description}
              </span>
              {e.lapNumber !== null && (
                <span className="shrink-0 text-muted tabular-nums font-mono text-[10px]">
                  L{e.lapNumber}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
