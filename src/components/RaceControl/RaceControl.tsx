import { useEffect, useMemo, useState } from "react";
import type { RaceControl as RaceControlEntry, Driver } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import {
  normalizeRaceControl,
  groupEventsByLap,
  groupEventsByPhase,
  buildPhaseAtMsLookup,
  deriveTrackFlagState,
  type RaceControlKind,
} from "@/timeline/raceControl";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_ACCENT_CLASS,
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_BUTTON_CLASS,
  COMMENTARY_EMPTY_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_META_CLASS,
  COMMENTARY_ROW_CLASS,
  COMMENTARY_SEARCH_CLASS,
  COMMENTARY_TIME_CLASS,
  COMMENTARY_TITLE_CLASS,
  COMMENTARY_TOOLBAR_CLASS,
  commentaryGroupLabel,
  formatSessionElapsedTime,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryJumpButton } from "@/components/CommentaryPanels/CommentaryJumpButton";
import { Chip } from "@/components/SettingsModal/SettingsPrimitives";
import { DEFAULT_FLAG_CONFIG, FLAG_CONFIG } from "./flagConfig";
import { raceControlEventAccent, raceControlEventBadge } from "./eventStyle";

// ─── Visual config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = DEFAULT_FLAG_CONFIG;

// ─── Kind filter groups ───────────────────────────────────────────────────────

type KindGroup = {
  key: string;
  label: string;
  /** Chip swatch colour. */
  color: string;
  kinds: RaceControlKind[];
};

const KIND_GROUPS: KindGroup[] = [
  {
    key: "flags",
    label: "Flags",
    color: "#f5d400",
    kinds: ["flag", "safety_car"],
  },
  {
    key: "incidents",
    label: "Incidents",
    color: "#e8002d",
    kinds: ["penalty", "investigation"],
  },
  {
    key: "session",
    label: "Session",
    color: "#39b54a",
    kinds: ["session_status"],
  },
  { key: "drs", label: "DRS", color: "#9b59f5", kinds: ["drs"] },
  {
    key: "other",
    label: "Other",
    color: "#8a8a99",
    kinds: ["car_event", "other"],
  },
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
  readonly onJump?: (ms: number) => void;
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
  onJump,
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
  const phaseAt = useMemo(() => buildPhaseAtMsLookup(normalized), [normalized]);

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
      const phaseGroups = groupEventsByPhase(filteredEntries, phaseAt);
      return phaseGroups.map((pg) => ({
        lapNumber: pg.phase,
        events: pg.events,
      }));
    }

    // For race/sprint, group by lap
    return groupEventsByLap(filteredEntries).reverse();
  }, [filteredEntries, sessionType, phaseAt]);

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
              className="bg-black/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-inherit"
            >
              S{s}
            </span>
          ))}
        </div>
      )}

      {/* ── Filter toolbar ─────────────────────────────────────── */}
      <div
        className={`${COMMENTARY_TOOLBAR_CLASS} !flex-nowrap overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:whitespace-nowrap`}
      >
        {KIND_GROUPS.map((g) => (
          <Chip
            key={g.key}
            label={g.label}
            color={g.color}
            active={activeGroups.has(g.key)}
            onToggle={() => toggleGroup(g.key)}
          />
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
            className={COMMENTARY_BUTTON_CLASS}
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
          className={`ml-auto ${COMMENTARY_SEARCH_CLASS}`}
        />
      </div>

      {/* ── Driver focus banner ────────────────────────────────── */}
      {focusDriver !== null && (
        <div className="relative flex items-center gap-2 border border-panel bg-surface py-1.5 pl-4 pr-2">
          <span
            aria-hidden="true"
            className={COMMENTARY_ACCENT_CLASS}
            style={{
              backgroundColor: teamColor(focusedDriver?.team_colour, "#e8002d"),
            }}
          />
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
              className={`ml-auto ${COMMENTARY_BUTTON_CLASS}`}
              aria-label="Clear driver filter"
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* ── Lap-grouped feed ───────────────────────────────────── */}
      <div className="space-y-2">
        {visibleLapGroups.length === 0 && (
          <div className={`border border-panel bg-surface ${COMMENTARY_EMPTY_CLASS}`}>
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
                  const isPenaltyEntry = e.kind === "penalty";
                  const eventDriver =
                    e.driverNumber !== null
                      ? driverMap.get(e.driverNumber)
                      : null;
                  const eventTime = formatSessionElapsedTime(
                    Math.max(0, e.ms),
                  );
                  const badge = raceControlEventBadge(e);
                  const rowToneClass = isPenaltyEntry
                    ? "bg-red-500/[0.08] hover:bg-red-500/[0.12]"
                    : "";
                  const accentBorderStyle = raceControlEventAccent(
                    e,
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
                          className={COMMENTARY_ACCENT_CLASS}
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
                            className={`${COMMENTARY_BADGE_CLASS} ${badge.className}`}
                            style={badge.style}
                          >
                            {badge.label}
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
                      {onJump && (
                        <CommentaryJumpButton
                          ms={e.ms}
                          label={e.title || e.description}
                          onJump={onJump}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* Feed is newest-first, so older items load at the bottom */}
        {hasMoreEvents && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => prev + RENDER_STEP)}
              className={COMMENTARY_BUTTON_CLASS}
            >
              Load older ({totalFilteredEvents - renderLimit} hidden)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
