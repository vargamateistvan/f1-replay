import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { RaceControl as RaceControlEntry, Driver } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import {
  normalizeRaceControl,
  toFlagKey,
  groupEventsByLap,
  groupEventsByPhase,
  deriveTrackFlagState,
  type RaceControlSeverity,
  type RaceControlKind,
} from "@/timeline/raceControl";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_CHEVRON_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_META_CLASS,
  COMMENTARY_ROW_CLASS,
  COMMENTARY_TIME_CLASS,
  COMMENTARY_TITLE_CLASS,
  commentaryGroupLabel,
  formatSessionElapsedTime,
} from "@/components/CommentaryPanels/commentaryList";
import {
  DEFAULT_FLAG_CONFIG,
  FLAG_CONFIG,
  flagAccentStyle,
  type FlagVisualConfig,
} from "./flagConfig";

// ─── Visual config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = DEFAULT_FLAG_CONFIG;

const SEVERITY_BADGE: Record<
  RaceControlSeverity,
  { label: string; cls: string }
> = {
  info: { label: "Info", cls: "bg-track text-white/80" },
  warning: { label: "Warn", cls: "bg-amber-500/20 text-amber-300" },
  critical: { label: "Critical", cls: "bg-red-500/20 text-red-300" },
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

// Banner priority when multiple sector flags are active (lower index wins).
const FLAG_BANNER_PRIORITY = [
  "RED",
  "SAFETY_CAR",
  "VIRTUAL_SC",
  "VIRTUAL_SAFETY_CAR",
  "DOUBLE_YELLOW",
  "YELLOW",
  "CHEQUERED",
  "BLACK",
  "BLACK_AND_ORANGE",
  "BLACK_AND_WHITE",
  "BLUE",
];

function flagBannerPriority(flagKey: string): number {
  const index = FLAG_BANNER_PRIORITY.indexOf(flagKey);
  return index === -1 ? FLAG_BANNER_PRIORITY.length : index;
}

function eventAccentBorderStyle(
  flag: string | null,
  cfg: FlagVisualConfig,
  teamColour?: string,
): CSSProperties | null {
  if (!flag) {
    return teamColour ? { backgroundColor: teamColor(teamColour) } : null;
  }
  return flagAccentStyle(cfg);
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

  // Active flag banner — driven by the flag-state machine so clear signals,
  // restarts and sector-scoped yellows are reflected correctly at the playhead.
  const flagState = useMemo(() => {
    if (!sessionStartMs) return null;
    return deriveTrackFlagState(
      entries,
      sessionStartMs,
      sessionStartMs + sessionTimeMs,
    );
  }, [entries, sessionStartMs, sessionTimeMs]);

  const activeBannerFlag = useMemo(() => {
    if (!flagState) return null;
    if (flagState.globalFlag) {
      return { flagKey: flagState.globalFlag, sectors: [] as number[] };
    }
    // Marshal post numbers, which is what the message itself says
    // ("YELLOW IN TRACK SECTOR 23"), rather than a timing sector.
    const flagged = Object.entries(flagState.marshalFlags).map(
      ([post, flag]) => ({ post: Number(post), flag }),
    );
    if (flagged.length === 0) return null;
    let best = flagged[0]!.flag;
    for (const { flag } of flagged) {
      if (flagBannerPriority(flag) < flagBannerPriority(best)) best = flag;
    }
    return {
      flagKey: best,
      sectors: flagged
        .filter((entry) => entry.flag === best)
        .map((entry) => entry.post)
        .sort((a, b) => a - b),
    };
  }, [flagState]);

  const flagConfig = activeBannerFlag
    ? (FLAG_CONFIG[activeBannerFlag.flagKey] ?? DEFAULT_CONFIG)
    : null;
  const flagBannerLabel = activeBannerFlag
    ? flagConfig!.label || activeBannerFlag.flagKey.replace(/_/g, " ")
    : "";

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

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleEntries
      .filter((e) => enabledKinds.has(e.kind))
      .filter(
        (e) =>
          focusDriver === null ||
          e.driverNumber === null ||
          e.driverNumber === focusDriver,
      )
      .filter(
        (e) =>
          !query ||
          e.description.toLowerCase().includes(query) ||
          e.title.toLowerCase().includes(query),
      );
  }, [visibleEntries, enabledKinds, focusDriver, search]);

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

  // Reset pagination only when the user changes what they're looking at —
  // not on every new event crossing the playhead.
  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [sessionKey, focusDriver, search, activeGroups]);

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
    <div className={COMMENTARY_FEED_SCROLL_CLASS}>
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
            {flagBannerLabel}
          </span>
          {activeBannerFlag?.sectors.map((s) => (
            <span
              key={s}
              className="rounded bg-black/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-inherit"
            >
              S{s}
            </span>
          ))}
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
          aria-label="Search race control events"
          className="ml-auto h-6 w-28 min-w-0 rounded border border-panel bg-surface px-2 text-[10px] text-white placeholder:text-muted outline-none focus:border-muted sm:w-32"
        />
      </div>

      {/* ── Driver focus banner ────────────────────────────────── */}
      {focusDriver !== null && (
        <div
          className="flex items-center gap-2 rounded border border-panel bg-surface/80 px-2 py-1.5"
          style={{
            borderLeft: `3px solid ${teamColor(focusedDriver?.team_colour, "#e8002d")}`,
          }}
        >
          <span
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: teamColor(focusedDriver?.team_colour, "#ffffff") }}
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

      {/* ── Lap-grouped feed ───────────────────────────────────── */}
      <div className="space-y-1">
        {visibleLapGroups.length === 0 && (
          <div className="rounded border border-panel bg-surface/80 p-3 text-xs text-muted">
            {sessionStartMs ? "No events match filters" : "Select a session"}
          </div>
        )}
        {visibleLapGroups.map((group, groupIndex) => {
          return (
            <div
              key={`${group.lapNumber ?? "session"}-${groupIndex}`}
              className={COMMENTARY_GROUP_CLASS}
            >
              {/* Lap/phase header */}
              <div className={COMMENTARY_GROUP_HEADER_CLASS}>
                {commentaryGroupLabel(sessionType, group.lapNumber)}
              </div>
              {/* Events in this lap/phase — reverse so newest is first within the group */}
              <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
                {[...group.events].reverse().map((e) => {
                  const cfg = FLAG_CONFIG[toFlagKey(e.flag)] ?? DEFAULT_CONFIG;
                  const hasFlagConfig =
                    Boolean(e.flag) && cfg !== DEFAULT_CONFIG;
                  const severity = SEVERITY_BADGE[e.severity];
                  const isPenaltyEntry = e.kind === "penalty";
                  const eventDriver =
                    e.driverNumber !== null
                      ? driverMap.get(e.driverNumber)
                      : null;
                  const eventTime = formatSessionElapsedTime(
                    Math.max(0, e.ms),
                  );
                  const badgeLabel = e.flag
                    ? cfg.label || e.flag
                    : isPenaltyEntry
                      ? "Penalty"
                      : severity.label;
                  const badgeStyle = hasFlagConfig
                    ? {
                        backgroundColor: cfg.badgeBg,
                        color: cfg.badgeText,
                      }
                    : undefined;
                  // `!` keeps the row tone from being overridden by the
                  // shared even: zebra-stripe background.
                  const rowToneClass = isPenaltyEntry
                    ? "!bg-red-500/10 ring-1 ring-inset ring-red-500/25 hover:!bg-red-500/15"
                    : eventDriver
                      ? "!bg-track/50 hover:!bg-white/[0.04]"
                      : "";
                  const accentBorderStyle = eventAccentBorderStyle(
                    e.flag,
                    cfg,
                    eventDriver?.team_colour,
                  );
                  return (
                    <div
                      key={e.id}
                      className={`${COMMENTARY_ROW_CLASS} ${rowToneClass}`}
                    >
                      {accentBorderStyle && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-[6px]"
                          style={accentBorderStyle}
                        />
                      )}
                      <span className={COMMENTARY_TIME_CLASS}>
                        {eventTime}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={COMMENTARY_TITLE_CLASS}>
                          {e.description}
                        </div>
                        <div className={COMMENTARY_META_CLASS}>
                          <span
                            className={`${COMMENTARY_BADGE_CLASS} ${
                              hasFlagConfig
                                ? ""
                                : isPenaltyEntry
                                  ? "bg-red-500/25 text-red-200"
                                  : severity.cls
                            }`}
                            style={badgeStyle}
                          >
                            {badgeLabel}
                          </span>
                          {eventDriver && (
                            <span
                              className="font-black uppercase tracking-widest"
                              style={{
                                color: teamColor(eventDriver.team_colour),
                              }}
                            >
                              {eventDriver.name_acronym}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={COMMENTARY_CHEVRON_CLASS}>›</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* Feed is newest-first, so older items load at the bottom */}
        {hasMoreEvents && (
          <div className="rounded border border-panel bg-surface/80 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => prev + RENDER_STEP)}
              className="h-6 rounded px-2 text-[9px] font-black uppercase tracking-widest transition-colors bg-track text-muted hover:text-white hover:bg-panel"
            >
              Load older ({totalFilteredEvents - renderLimit} hidden)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
