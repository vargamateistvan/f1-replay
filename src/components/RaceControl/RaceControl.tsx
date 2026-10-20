import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Car,
  Flag,
  Gavel,
  Info,
  ScanSearch,
  Siren,
  Timer,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RaceControl as RaceControlEntry, Driver } from "@/api/types";
import { COMMENTARY_FRESH_MS } from "@/constants";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import {
  normalizeRaceControl,
  groupEventsByLap,
  groupEventsByPhase,
  deriveTrackFlagState,
  toFlagKey,
  type RaceControlKind,
} from "@/timeline/raceControl";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_META_CLASS,
  COMMENTARY_ROW_CLASS,
  COMMENTARY_TIME_CLASS,
  COMMENTARY_TITLE_CLASS,
  COMMENTARY_FRESH_ROW_CLASS,
  commentaryGroupLabel,
  formatSessionElapsedTime,
  isFreshCommentaryItem,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryJumpButton } from "@/components/CommentaryPanels/CommentaryJumpButton";
import {
  CommentaryGroupHeader,
  DriverChip,
  FreshTag,
} from "@/components/CommentaryPanels/CommentaryBits";
import { DEFAULT_FLAG_CONFIG, FLAG_CONFIG, flagAccentStyle } from "./flagConfig";
import { raceControlEventAccent, raceControlEventBadge } from "./eventStyle";

// ─── Visual config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = DEFAULT_FLAG_CONFIG;

// ─── Kind filter groups ───────────────────────────────────────────────────────

type KindGroup = {
  key: string;
  label: string;
  kinds: RaceControlKind[];
  /** Dot colour on the filter chip. */
  dot: string;
};

const KIND_GROUPS: KindGroup[] = [
  { key: "flags", label: "Flags", kinds: ["flag", "safety_car"], dot: "#f5d400" },
  {
    key: "incidents",
    label: "Incidents",
    kinds: ["penalty", "investigation"],
    dot: "#e8002d",
  },
  { key: "session", label: "Session", kinds: ["session_status"], dot: "#4da6ff" },
  { key: "drs", label: "DRS", kinds: ["drs"], dot: "#39b54a" },
  { key: "other", label: "Other", kinds: ["car_event", "other"], dot: "#9ca3af" },
];

const KIND_ICON: Record<RaceControlKind, LucideIcon> = {
  flag: Flag,
  safety_car: Car,
  penalty: Gavel,
  investigation: ScanSearch,
  session_status: Timer,
  drs: Wind,
  car_event: Wrench,
  other: Info,
};

/** Flags that stop or neutralise the race; their status bar pulses. */
const NEUTRALISING_FLAGS = new Set([
  "RED",
  "SAFETY_CAR",
  "VIRTUAL_SC",
  "VIRTUAL_SAFETY_CAR",
]);

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

/** Wraps case-insensitive matches of `query` in <mark>; plain string when there are none. */
function highlightMatches(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query, from);
  if (at === -1) return text;
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-f1red/30 px-0.5 text-white">
        {text.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
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

  // When the active banner flag was last shown, for the "for 2:14" readout.
  const bannerSinceMs = useMemo(() => {
    if (!activeBannerFlag) return null;
    let since: number | null = null;
    for (const e of normalized) {
      if (e.ms > sessionTimeMs) break;
      if (toFlagKey(e.flag) === activeBannerFlag.flagKey) since = e.ms;
    }
    return since;
  }, [activeBannerFlag, normalized, sessionTimeMs]);

  const isNeutralised = activeBannerFlag
    ? NEUTRALISING_FLAGS.has(activeBannerFlag.flagKey)
    : false;
  const hasStarted = visibleEntries.length > 0;

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of KIND_GROUPS) {
      const kinds = new Set(g.kinds);
      counts.set(g.key, visibleEntries.filter((e) => kinds.has(e.kind)).length);
    }
    return counts;
  }, [visibleEntries]);

  const query = search.trim().toLowerCase();

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
  }, [visibleEntries, enabledKinds, focusDriver, query]);

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
      {flagConfig ? (
        <div
          role="status"
          className="relative flex h-8 shrink-0 items-center gap-2 overflow-hidden rounded px-3 shadow-sm"
          style={{
            backgroundColor: flagConfig.bannerBg,
            color: flagConfig.bannerText,
          }}
        >
          {/* Diagonal sheen so the bar reads as a flag, not a plain fill */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0_10px,transparent_10px_20px)]"
          />
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            {isNeutralised && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
          {isNeutralised ? (
            <Siren size={14} strokeWidth={2.5} className="relative shrink-0" aria-hidden="true" />
          ) : (
            <Flag size={13} strokeWidth={2.5} className="relative shrink-0" aria-hidden="true" />
          )}
          <span className="relative font-black text-[11px] tracking-widest uppercase">
            {flagBannerLabel}
          </span>
          {activeBannerFlag?.sectors.map((s) => (
            <span
              key={s}
              className="relative rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-inherit"
            >
              S{s}
            </span>
          ))}
          {bannerSinceMs !== null && (
            <span className="relative ml-auto font-mono text-[10px] font-bold tabular-nums opacity-80">
              for {formatSessionElapsedTime(Math.max(0, sessionTimeMs - bannerSinceMs))}
            </span>
          )}
        </div>
      ) : (
        hasStarted && (
          <div
            role="status"
            className="flex h-8 shrink-0 items-center gap-2 rounded border border-f1-green/30 bg-f1-green/10 px-3 text-f1-green"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-f1-green" aria-hidden="true" />
            <Flag size={13} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
            <span className="font-black text-[11px] tracking-widest uppercase">
              Track clear
            </span>
          </div>
        )
      )}

      {/* ── Filter toolbar ─────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-1 rounded border border-panel bg-track px-2 py-1.5">
        {KIND_GROUPS.map((g) => {
          const active = activeGroups.has(g.key);
          const count = groupCounts.get(g.key) ?? 0;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => toggleGroup(g.key)}
              aria-pressed={active}
              className={`flex h-6 items-center gap-1.5 rounded border px-2 text-[9px] font-black uppercase tracking-widest transition-colors ${
                active
                  ? "border-white/10 bg-panel text-white"
                  : "border-transparent bg-track text-muted opacity-60 hover:opacity-100"
              }`}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: g.dot }}
              />
              {g.label}
              <span
                aria-hidden="true"
                className="font-mono text-[9px] font-bold tabular-nums text-muted"
              >
                {count}
              </span>
            </button>
          );
        })}
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
          const groupFlags = [
            ...new Set(
              group.events
                .map((e) => toFlagKey(e.flag))
                .filter((key) => key && FLAG_CONFIG[key]),
            ),
          ].slice(0, 5);
          return (
            <div
              key={`${group.lapNumber ?? "session"}-${groupIndex}`}
              className={COMMENTARY_GROUP_CLASS}
            >
              {/* Lap/phase header */}
              <CommentaryGroupHeader
                label={commentaryGroupLabel(sessionType, group.lapNumber)}
                count={group.events.length}
              >
                {groupFlags.length > 0 && (
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    {groupFlags.map((key) => (
                      <span
                        key={key}
                        title={FLAG_CONFIG[key]!.label}
                        className="h-2 w-2 rounded-[2px] ring-1 ring-black/30"
                        style={flagAccentStyle(FLAG_CONFIG[key]!, 4)}
                      />
                    ))}
                  </span>
                )}
              </CommentaryGroupHeader>
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
                  const KindIcon = KIND_ICON[e.kind];
                  const ageMs = sessionTimeMs - e.ms;
                  const isFresh = isFreshCommentaryItem(
                    ageMs,
                    showAllItems,
                    COMMENTARY_FRESH_MS,
                  );
                  // `!` keeps the row tone from being overridden by the
                  // shared even: zebra-stripe background.
                  let rowToneClass = "";
                  if (isPenaltyEntry) {
                    rowToneClass =
                      "!bg-red-500/10 ring-1 ring-inset ring-red-500/25 hover:!bg-red-500/15";
                  } else if (e.severity === "critical") {
                    rowToneClass =
                      "!bg-amber-500/[0.07] hover:!bg-amber-500/[0.12]";
                  } else if (eventDriver) {
                    rowToneClass = "!bg-track/50 hover:!bg-white/[0.04]";
                  }
                  if (isFresh) {
                    rowToneClass += ` ${COMMENTARY_FRESH_ROW_CLASS}`;
                  }
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
                          className="absolute inset-y-0 left-0 w-[6px]"
                          style={accentBorderStyle}
                        />
                      )}
                      <span className={COMMENTARY_TIME_CLASS}>
                        {eventTime}
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* Wraps to two lines: RC messages are long and the
                            tail ("…DELETED - TRACK LIMITS AT TURN 4") matters. */}
                        <div
                          className={`${COMMENTARY_TITLE_CLASS} !whitespace-normal line-clamp-2 leading-snug ${
                            e.severity === "critical" ? "!text-white" : ""
                          }`}
                          title={e.description}
                        >
                          {highlightMatches(e.description, query)}
                        </div>
                        <div className={COMMENTARY_META_CLASS}>
                          <span
                            className={`${COMMENTARY_BADGE_CLASS} gap-1 ${badge.className}`}
                            style={badge.style}
                          >
                            <KindIcon
                              size={10}
                              strokeWidth={3}
                              className="shrink-0"
                              aria-hidden="true"
                            />
                            {badge.label}
                          </span>
                          {eventDriver && (
                            <DriverChip
                              driver={eventDriver}
                              driverNumber={eventDriver.driver_number}
                            />
                          )}
                          {isFresh && <FreshTag />}
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
