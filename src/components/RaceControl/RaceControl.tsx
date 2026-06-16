import { useMemo, useState } from "react";
import type { RaceControl as RaceControlEntry, Driver } from "@/api/types";
import {
  normalizeRaceControl,
  toFlagKey,
  buildPenaltyStates,
  groupEventsByLap,
  type RaceControlSeverity,
  type RaceControlKind,
} from "@/timeline/raceControl";

// ─── Visual config ───────────────────────────────────────────────────────────

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
  info: { label: "Info", cls: "bg-[#2a2a35] text-gray-300" },
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  readonly entries: RaceControlEntry[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly drivers?: Driver[];
  readonly focusDriver?: number | null;
  readonly onClearFocus?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RaceControlFeed({
  entries,
  sessionTimeMs,
  sessionStartMs,
  drivers = [],
  focusDriver = null,
  onClearFocus,
}: Props) {
  const [activeGroups, setActiveGroups] = useState<Set<string>>(
    () => new Set(ALL_GROUP_KEYS),
  );
  const [search, setSearch] = useState("");
  const [showPenalties, setShowPenalties] = useState(false);

  const normalized = useMemo(
    () => normalizeRaceControl(entries, sessionStartMs),
    [entries, sessionStartMs],
  );

  const visibleEntries = useMemo(
    () => normalized.filter((e) => e.ms <= sessionTimeMs),
    [normalized, sessionTimeMs],
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

  // Lap groups — descending so newest is on top
  const lapGroups = useMemo(
    () => groupEventsByLap(filteredEntries).reverse(),
    [filteredEntries],
  );

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
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Active flag banner ─────────────────────────────────── */}
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

      {/* ── Filter toolbar ─────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[#2a2a35] bg-track">
        {KIND_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => toggleGroup(g.key)}
            aria-pressed={activeGroups.has(g.key)}
            className={`h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors ${
              activeGroups.has(g.key)
                ? "bg-[#38383f] text-white"
                : "bg-[#1e1e28] text-muted"
            }`}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPenalties((v) => !v)}
          aria-pressed={showPenalties}
          className={`h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors ml-1 ${
            showPenalties
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "bg-[#1e1e28] text-muted"
          }`}
        >
          Tracker
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto h-6 px-2 text-[10px] bg-[#1e1e28] text-white placeholder:text-muted border border-[#2a2a35] rounded outline-none focus:border-[#5a5a6a] w-24"
        />
      </div>

      {/* ── Driver focus banner ────────────────────────────────── */}
      {focusDriver !== null && (
        <div
          className="shrink-0 flex items-center gap-2 px-2 py-1 border-b border-[#2a2a35] bg-[#18181f]"
          style={{
            borderLeft: `3px solid #${focusedDriver?.team_colour ?? "e8002d"}`,
          }}
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-white">
            {focusedDriver?.name_acronym ?? `#${focusDriver}`}
          </span>
          <span className="text-muted text-[9px]">driver filter active</span>
          {onClearFocus && (
            <button
              type="button"
              onClick={onClearFocus}
              className="ml-auto text-muted hover:text-white text-[9px] font-black uppercase tracking-widest"
              aria-label="Clear driver filter"
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* ── Penalty / investigation tracker ───────────────────── */}
      {showPenalties && (
        <div className="shrink-0 border-b border-[#2a2a35]">
          <div className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-muted bg-[#1a1a24]">
            Penalty Tracker
          </div>
          {penaltyStates.length === 0 ? (
            <div className="px-2 py-1.5 text-muted text-[10px]">
              No incidents in view
            </div>
          ) : (
            <div className="divide-y divide-[#2a2a35]">
              {penaltyStates.map((ps) => {
                const d = driverMap.get(ps.driverNumber);
                const cfg = PENALTY_STATUS_CONFIG[ps.status];
                return (
                  <div
                    key={ps.driverNumber}
                    className="flex items-center gap-2 px-2 py-1"
                    style={{
                      borderLeft: `3px solid #${d?.team_colour ?? "636369"}`,
                    }}
                  >
                    <span
                      className="text-[10px] font-black uppercase w-8 shrink-0"
                      style={{ color: `#${d?.team_colour ?? "ffffff"}` }}
                    >
                      {d?.name_acronym ?? `#${ps.driverNumber}`}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${cfg.cls}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-muted text-[9px] flex-1 truncate">
                      {ps.latestDescription}
                    </span>
                    {ps.lapNumber !== null && (
                      <span className="shrink-0 text-muted font-mono text-[9px]">
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
      <div className="flex-1 overflow-auto" style={{ touchAction: "pan-y" }}>
        {lapGroups.length === 0 && (
          <div className="p-2 text-muted text-xs">
            {sessionStartMs ? "No events match filters" : "Select a session"}
          </div>
        )}
        {lapGroups.map((group) => (
          <div key={group.lapNumber ?? "session"} className="mb-0.5">
            {/* Lap header */}
            <div className="sticky top-0 z-10 px-2 py-0.5 bg-[#1a1a24] border-b border-[#2a2a35] text-[9px] font-black uppercase tracking-widest text-muted select-none">
              {group.lapNumber !== null ? `Lap ${group.lapNumber}` : "Session"}
            </div>
            {/* Events in this lap — reverse so newest is first within the lap */}
            {[...group.events].reverse().map((e) => {
              const cfg = FLAG_CONFIG[toFlagKey(e.flag)] ?? DEFAULT_CONFIG;
              const sector = sectorBadge(e);
              const severity = SEVERITY_BADGE[e.severity];
              const typeLabel = e.kind.replace(/_/g, " ");
              const eventDriver =
                e.driverNumber !== null ? driverMap.get(e.driverNumber) : null;
              return (
                <div
                  key={e.id}
                  className={`flex gap-2 px-2 py-1.5 text-xs border-b border-[#2a2a35] ${
                    eventDriver ? "bg-[#18181f]" : ""
                  }`}
                  style={
                    eventDriver
                      ? {
                          borderLeft: `2px solid #${eventDriver.team_colour}`,
                        }
                      : undefined
                  }
                >
                  {/* Left column: flag label + driver acronym + severity + kind */}
                  <div className="flex shrink-0 flex-col items-start gap-0.5 w-[4.5rem]">
                    {e.flag && (
                      <span
                        className={`font-black text-[10px] uppercase tracking-widest ${cfg.text}`}
                      >
                        {cfg.label || e.flag}
                      </span>
                    )}
                    {eventDriver && (
                      <span
                        className="font-black text-[10px] uppercase tracking-widest"
                        style={{ color: `#${eventDriver.team_colour}` }}
                      >
                        {eventDriver.name_acronym}
                      </span>
                    )}
                    <span
                      className={`rounded px-1 py-0.5 text-[8px] font-black uppercase tracking-widest ${severity.cls}`}
                    >
                      {severity.label}
                    </span>
                    <span className="rounded bg-panel px-1 py-0.5 text-[8px] font-black uppercase tracking-widest text-muted">
                      {typeLabel}
                    </span>
                    {sector && (
                      <span className="rounded bg-panel px-1 py-0.5 text-[8px] font-black uppercase tracking-widest text-muted">
                        {sector}
                      </span>
                    )}
                  </div>
                  {/* Message */}
                  <span className="flex-1 text-white/90 leading-snug text-[11px]">
                    {e.description}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
