import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { RaceControl as RaceControlEntry, Driver } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import {
  normalizeRaceControl,
  toFlagKey,
  buildPenaltyStates,
  groupEventsByLap,
  groupEventsByPhase,
  type RaceControlSeverity,
  type RaceControlKind,
} from "@/timeline/raceControl";
import { isPracticeSession } from "@/utils/session";

// ─── Visual config ───────────────────────────────────────────────────────────

const CHEQUERED_BORDER_IMAGE = (() => {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'>" +
    "<rect width='6' height='6' fill='#111'/>" +
    "<rect x='6' y='6' width='6' height='6' fill='#111'/>" +
    "<rect x='6' width='6' height='6' fill='#fff'/>" +
    "<rect y='6' width='6' height='6' fill='#fff'/>" +
    "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

const FLAG_CONFIG: Record<
  string,
  {
    label: string;
    bannerBg: string;
    bannerText: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    borderPattern?: string;
  }
> = {
  GREEN: {
    label: "GREEN",
    bannerBg: "#39b54a",
    bannerText: "#fff",
    badgeBg: "#39b54a",
    badgeText: "#fff",
    border: "#39b54a",
  },
  YELLOW: {
    label: "YELLOW",
    bannerBg: "#f5d400",
    bannerText: "#000",
    badgeBg: "#f5d400",
    badgeText: "#000",
    border: "#f5d400",
  },
  DOUBLE_YELLOW: {
    label: "DBL YELLOW",
    bannerBg: "#f5d400",
    bannerText: "#000",
    badgeBg: "#f5d400",
    badgeText: "#000",
    border: "#f5d400",
  },
  RED: {
    label: "RED FLAG",
    bannerBg: "#e8002d",
    bannerText: "#fff",
    badgeBg: "#e8002d",
    badgeText: "#fff",
    border: "#e8002d",
  },
  CHEQUERED: {
    label: "CHEQUERED",
    bannerBg: "#fff",
    bannerText: "#000",
    badgeBg: "#fff",
    badgeText: "#000",
    border: "#e8e8e8",
    borderPattern: CHEQUERED_BORDER_IMAGE,
  },
  BLUE: {
    label: "BLUE",
    bannerBg: "#4da6ff",
    bannerText: "#000",
    badgeBg: "#4da6ff",
    badgeText: "#000",
    border: "#4da6ff",
  },
  BLACK_AND_WHITE: {
    label: "BLK/WHT",
    bannerBg: "#888",
    bannerText: "#fff",
    badgeBg: "#888",
    badgeText: "#fff",
    border: "#888",
  },
  SAFETY_CAR: {
    label: "SAFETY CAR",
    bannerBg: "#f5a623",
    bannerText: "#000",
    badgeBg: "#f5a623",
    badgeText: "#000",
    border: "#f5a623",
  },
  VIRTUAL_SC: {
    label: "VIRTUAL SC",
    bannerBg: "#f5a623",
    bannerText: "#000",
    badgeBg: "#f5a623",
    badgeText: "#000",
    border: "#f5a623",
  },
  VIRTUAL_SAFETY_CAR: {
    label: "VIRTUAL SC",
    bannerBg: "#f5a623",
    bannerText: "#000",
    badgeBg: "#f5a623",
    badgeText: "#000",
    border: "#f5a623",
  },
  CLEAR: {
    label: "CLEAR",
    bannerBg: "#39b54a",
    bannerText: "#fff",
    badgeBg: "#39b54a",
    badgeText: "#fff",
    border: "#39b54a",
  },
};

const DEFAULT_CONFIG = {
  label: "",
  bannerBg: "transparent",
  bannerText: "#fff",
  badgeBg: "transparent",
  badgeText: "#fff",
  border: "transparent",
};

const SEVERITY_BADGE: Record<
  RaceControlSeverity,
  { label: string; cls: string }
> = {
  info: { label: "Info", cls: "bg-track text-white/80" },
  warning: { label: "Warn", cls: "bg-amber-500/20 text-amber-300" },
  critical: { label: "Critical", cls: "bg-red-500/20 text-red-300" },
};

const PENALTY_STATUS_CONFIG = {
  noted: { label: "Noted", cls: "bg-slate-500/20 text-slate-300" },
  investigating: {
    label: "Investigating",
    cls: "bg-amber-500/20 text-amber-300",
  },
  penalty: { label: "Penalty", cls: "bg-red-500/20 text-red-300" },
  cleared: { label: "Cleared", cls: "bg-green-500/20 text-green-300" },
};

// ─── Kind filter groups ───────────────────────────────────────────────────────

type KindGroup = { key: string; label: string; kinds: RaceControlKind[] };

const KIND_GROUPS: KindGroup[] = [
  { key: "flags", label: "Flags", kinds: ["flag", "safety_car"] },
  {
    key: "incidents",
    label: "Incidents",
    kinds: ["penalty", "investigation"],
  },
  { key: "session", label: "Session", kinds: ["session_status"] },
  { key: "drs", label: "DRS", kinds: ["drs"] },
  { key: "other", label: "Other", kinds: ["car_event", "other"] },
];

const ALL_GROUP_KEYS = new Set(KIND_GROUPS.map((g) => g.key));
const INITIAL_RENDER_LIMIT = 180;
const RENDER_STEP = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sectorBadge(entry: {
  sector: number | null;
  scope: string | null;
}): string | null {
  if (entry.sector !== null && entry.sector >= 1 && entry.sector <= 3) {
    return `S${entry.sector}`;
  }
  if (
    entry.scope &&
    entry.scope.trim() !== "" &&
    entry.scope.toLowerCase() !== "track"
  )
    return entry.scope;
  return null;
}

function eventAccentBorderStyle(
  flag: string | null,
  cfg: (typeof FLAG_CONFIG)[keyof typeof FLAG_CONFIG],
  teamColour?: string,
): CSSProperties | null {
  if (!flag) {
    return teamColour ? { backgroundColor: `#${teamColour}` } : null;
  }

  if (cfg.borderPattern) {
    return {
      backgroundImage: cfg.borderPattern,
      backgroundSize: "12px 12px",
      backgroundRepeat: "repeat",
    };
  }

  return { backgroundColor: cfg.border };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  readonly entries: RaceControlEntry[];
  readonly sessionKey?: number | null;
  readonly sessionType?: string;
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly showAllItems?: boolean;
  readonly drivers?: Driver[];
  readonly focusDriver?: number | null;
  readonly onClearFocus?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RaceControlFeed({
  entries,
  sessionKey = null,
  sessionType,
  sessionTimeMs,
  sessionStartMs,
  showAllItems = false,
  drivers = [],
  focusDriver = null,
  onClearFocus,
}: Props) {
  const showCsvExportButtons = useSettings((s) => s.showCsvExportButtons);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(
    () => new Set(ALL_GROUP_KEYS),
  );
  const [search, setSearch] = useState("");
  const [showPenalties, setShowPenalties] = useState(false);
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  const normalized = useMemo(
    () => normalizeRaceControl(entries, sessionStartMs),
    [entries, sessionStartMs],
  );

  const visibleEntries = useMemo(
    () =>
      showAllItems
        ? normalized
        : normalized.filter((e) => e.ms <= sessionTimeMs),
    [normalized, sessionTimeMs, showAllItems],
  );

  // Active flag banner
  const currentFlagEntry = useMemo(() => {
    for (let i = visibleEntries.length - 1; i >= 0; i--) {
      const e = visibleEntries[i]!;
      if (e.flag && e.flag !== "") return e;
    }
    return null;
  }, [visibleEntries]);

  const flagConfig = currentFlagEntry
    ? (FLAG_CONFIG[toFlagKey(currentFlagEntry.flag)] ?? DEFAULT_CONFIG)
    : null;
  const currentSector = currentFlagEntry ? sectorBadge(currentFlagEntry) : null;

  const driverMap = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Enabled kind set derived from active group toggles
  const enabledKinds = useMemo(
    () =>
      new Set<RaceControlKind>(
        KIND_GROUPS.flatMap((g) => (activeGroups.has(g.key) ? g.kinds : [])),
      ),
    [activeGroups],
  );

  const filteredEntries = useMemo(
    () =>
      visibleEntries
        .filter((e) => enabledKinds.has(e.kind))
        .filter(
          (e) =>
            focusDriver === null ||
            e.driverNumber === null ||
            e.driverNumber === focusDriver,
        )
        .filter(
          (e) =>
            !search ||
            e.description.toLowerCase().includes(search.toLowerCase()) ||
            e.title.toLowerCase().includes(search.toLowerCase()),
        ),
    [visibleEntries, enabledKinds, focusDriver, search],
  );

  // Lap/phase groups — descending so newest is on top
  const lapGroups = useMemo(() => {
    const isQualifying = sessionType?.toLowerCase().includes("qualifying");
    const isPractice = sessionType ? isPracticeSession(sessionType) : false;

    if (isPractice) {
      return filteredEntries.length
        ? [{ lapNumber: null, events: filteredEntries }]
        : [];
    }

    if (isQualifying) {
      // For qualifying, group by phase (Q1, Q2, Q3)
      const phaseGroups = groupEventsByPhase(filteredEntries);
      return phaseGroups.map((pg) => ({
        lapNumber: pg.phase,
        events: pg.events,
      }));
    }

    // For race/sprint, group by lap
    return groupEventsByLap(filteredEntries).reverse();
  }, [filteredEntries, sessionType]);

  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [sessionKey, focusDriver, search, activeGroups, filteredEntries.length]);

  const totalFilteredEvents = filteredEntries.length;
  const hasMoreEvents = totalFilteredEvents > renderLimit;

  const visibleLapGroups = useMemo(() => {
    let remaining = renderLimit;
    const groups: Array<{
      lapNumber: number | null;
      events: typeof filteredEntries;
    }> = [];

    for (const group of lapGroups) {
      if (remaining <= 0) break;
      const count = Math.min(group.events.length, remaining);
      if (count <= 0) continue;
      groups.push({
        lapNumber: group.lapNumber,
        events: group.events.slice(group.events.length - count),
      });
      remaining -= count;
    }

    return groups;
  }, [lapGroups, renderLimit]);

  const penaltyStates = useMemo(
    () => (showPenalties ? buildPenaltyStates(visibleEntries) : []),
    [visibleEntries, showPenalties],
  );

  const toggleGroup = (key: string) => {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // never empty
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const focusedDriver =
    focusDriver !== null ? driverMap.get(focusDriver) : null;

  return (
    <div className="panel-scroll px-2 pb-2 space-y-1">
      {/* ── Active flag banner ─────────────────────────────────── */}
      {flagConfig && (
        <div
          className="flex items-center gap-2 px-3 h-7 shrink-0"
          style={{
            backgroundColor: flagConfig.bannerBg,
            color: flagConfig.bannerText,
          }}
        >
          <span className="font-black text-[10px] tracking-widest uppercase">
            {flagConfig.label}
          </span>
          {currentSector && (
            <span className="rounded bg-black/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-inherit">
              {currentSector}
            </span>
          )}
        </div>
      )}

      {/* ── Filter toolbar ─────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-panel bg-track">
        {KIND_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => toggleGroup(g.key)}
            aria-pressed={activeGroups.has(g.key)}
            className={`h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors ${
              activeGroups.has(g.key)
                ? "bg-panel text-white"
                : "bg-track text-muted"
            }`}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPenalties((v) => !v)}
          aria-pressed={showPenalties}
          className={`h-6 rounded px-2 text-[9px] font-black uppercase tracking-widest transition-colors ${
            showPenalties
              ? "border border-amber-500/40 bg-amber-500/20 text-amber-300"
              : "bg-track text-muted hover:text-white hover:bg-panel"
          }`}
        >
          Tracker
        </button>
        {sessionKey !== null && showCsvExportButtons && (
          <button
            type="button"
            onClick={() => {
              void downloadEndpointCsv(
                "race_control",
                { session_key: sessionKey },
                `race_control_${sessionKey}.csv`,
              );
            }}
            className="h-6 rounded px-2 text-[9px] font-black uppercase tracking-widest bg-panel text-muted transition-colors hover:bg-track hover:text-white"
            aria-label="Export race control CSV"
          >
            Export CSV
          </button>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto h-6 w-28 min-w-0 rounded border border-panel bg-surface px-2 text-[10px] text-white placeholder:text-muted outline-none focus:border-muted sm:w-32"
        />
      </div>

      {/* ── Driver focus banner ────────────────────────────────── */}
      {focusDriver !== null && (
        <div
          className="rounded border border-panel bg-surface/80 px-2 py-1.5"
          style={{
            borderLeft: `3px solid #${focusedDriver?.team_colour ?? "e8002d"}`,
          }}
        >
          <span
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: `#${focusedDriver?.team_colour ?? "ffffff"}` }}
          >
            {focusedDriver?.name_acronym ?? `#${focusDriver}`}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-muted">
            driver filter active
          </span>
          {onClearFocus && (
            <button
              type="button"
              onClick={onClearFocus}
              className="ml-auto text-[9px] font-black uppercase tracking-widest text-muted hover:text-white"
              aria-label="Clear driver filter"
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* ── Penalty / investigation tracker ───────────────────── */}
      {showPenalties && (
        <div className="overflow-hidden rounded border border-panel bg-surface/80">
          <div className="border-b border-panel bg-track px-2 py-1 text-[9px] font-black uppercase tracking-widest text-muted">
            Penalty Tracker
          </div>
          {penaltyStates.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-muted">
              No incidents in view
            </div>
          ) : (
            <div className="divide-y divide-panel">
              {penaltyStates.map((ps) => {
                const d = driverMap.get(ps.driverNumber);
                const cfg = PENALTY_STATUS_CONFIG[ps.status];
                return (
                  <div
                    key={ps.driverNumber}
                    className="flex items-center gap-2 px-2 py-2 transition-colors hover:bg-white/[0.04]"
                    style={{
                      borderLeft: `3px solid #${d?.team_colour ?? "636369"}`,
                    }}
                  >
                    <span
                      className="w-10 shrink-0 text-[10px] font-black uppercase tracking-widest"
                      style={{ color: `#${d?.team_colour ?? "ffffff"}` }}
                    >
                      {d?.name_acronym ?? `#${ps.driverNumber}`}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${cfg.cls}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-white/90">
                      {ps.latestDescription}
                    </span>
                    {ps.lapNumber !== null && (
                      <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted">
                        L{ps.lapNumber}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Lap-grouped feed ───────────────────────────────────── */}
      <div className="space-y-1">
        {visibleLapGroups.length === 0 && (
          <div className="rounded border border-panel bg-surface/80 p-3 text-xs text-muted">
            {sessionStartMs ? "No events match filters" : "Select a session"}
          </div>
        )}
        {hasMoreEvents && (
          <div className="sticky top-0 z-10 rounded border border-panel bg-surface/80 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => prev + RENDER_STEP)}
              className="h-6 rounded px-2 text-[9px] font-black uppercase tracking-widest transition-colors bg-track text-muted hover:text-white hover:bg-panel"
            >
              Load older ({totalFilteredEvents - renderLimit} hidden)
            </button>
          </div>
        )}
        {visibleLapGroups.map((group, groupIndex) => {
          const isQualifying = sessionType
            ?.toLowerCase()
            .includes("qualifying");
          const headerText = isQualifying
            ? group.lapNumber !== null
              ? `Q${group.lapNumber}`
              : "Session"
            : group.lapNumber !== null
              ? `Lap ${group.lapNumber}`
              : "Session";

          return (
            <div
              key={`${group.lapNumber ?? "session"}-${groupIndex}`}
              className="overflow-hidden rounded border border-panel bg-surface/80"
            >
              {/* Lap/phase header */}
              <div className="sticky top-0 z-10 border-b border-panel bg-track px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none">
                {headerText}
              </div>
              {/* Events in this lap/phase — reverse so newest is first within the group */}
              <div className="divide-y divide-panel">
                {[...group.events].reverse().map((e) => {
                  const cfg = FLAG_CONFIG[toFlagKey(e.flag)] ?? DEFAULT_CONFIG;
                  const severity = SEVERITY_BADGE[e.severity];
                  const eventDriver =
                    e.driverNumber !== null
                      ? driverMap.get(e.driverNumber)
                      : null;
                  const sessionMs = new Date(e.date).getTime() - sessionStartMs;
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const eventTime = (() => {
                    const ms = Math.max(0, sessionMs);
                    const s = Math.floor(ms / 1000);
                    const m = Math.floor(s / 60);
                    const h = Math.floor(m / 60);
                    return h > 0
                      ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
                      : `${pad(m)}:${pad(s % 60)}`;
                  })();
                  const badgeLabel = e.flag
                    ? cfg.label || e.flag
                    : severity.label;
                  const badgeStyle = e.flag
                    ? {
                        backgroundColor: cfg.badgeBg,
                        color: cfg.badgeText,
                      }
                    : undefined;
                  const accentBorderStyle = eventAccentBorderStyle(
                    e.flag,
                    cfg,
                    eventDriver?.team_colour,
                  );
                  return (
                    <div
                      key={e.id}
                      className={`relative mb-0.5 flex items-start gap-3 px-2 py-2.5 transition-colors hover:bg-white/[0.04] ${
                        eventDriver ? "bg-track/50" : ""
                      }`}
                    >
                      {accentBorderStyle && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-[6px]"
                          style={accentBorderStyle}
                        />
                      )}
                      <span className="w-10 shrink-0 pl-2 text-[10px] font-mono tabular-nums text-muted">
                        {eventTime}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold text-white/90">
                          {e.description}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                          <span
                            className={`inline-flex h-5 w-fit max-w-full shrink-0 items-center justify-center rounded px-1.5 whitespace-nowrap text-center text-[8px] font-black uppercase tracking-widest leading-none ${
                              e.flag ? "" : severity.cls
                            }`}
                            style={badgeStyle}
                          >
                            {badgeLabel}
                          </span>
                          {eventDriver && (
                            <span
                              className="font-black uppercase tracking-widest"
                              style={{ color: `#${eventDriver.team_colour}` }}
                            >
                              {eventDriver.name_acronym}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted">›</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
