import { useEffect, useMemo, useState } from "react";
import { Timer, Trophy } from "lucide-react";
import type { Driver, Pit, Stint } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import {
  COMMENTARY_FRESH_MS,
  PIT_STOP_QUICK_S,
  PIT_STOP_SLOW_S,
} from "@/constants";
import { TyreBadge } from "@/components/LiveTiming/TyreBadge";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { formatPitDuration, laneDuration, pitStopTime } from "@/utils/pit";
import { upperBoundByValue } from "@/utils/sortedTime";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_META_CLASS,
  COMMENTARY_ROW_CLASS,
  COMMENTARY_TIME_CLASS,
  COMMENTARY_FRESH_ROW_CLASS,
  COMMENTARY_TITLE_CLASS,
  commentaryGroupLabel,
  formatSessionElapsedTime,
  isFreshCommentaryItem,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryJumpButton } from "@/components/CommentaryPanels/CommentaryJumpButton";
import {
  CommentaryGroupHeader,
  CommentarySummary,
  DriverChip,
  FreshTag,
  type CommentaryStat,
} from "@/components/CommentaryPanels/CommentaryBits";

/** Text colour for a stationary stop time: quick, normal or slow. */
function stopTimeClass(entry: Pit, stop: number): string {
  if (entry.stop_duration === null) return "text-white/90";
  if (stop <= PIT_STOP_QUICK_S) return "text-f1-green";
  if (stop > PIT_STOP_SLOW_S) return "text-red-400";
  return "text-white/90";
}

interface Props {
  readonly entries: Pit[];
  readonly stints: Stint[];
  readonly sessionKey?: number | null;
  readonly sessionType?: string;
  readonly drivers: Driver[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly showAllItems?: boolean;
  readonly phaseLookup?: (ms: number) => number | null;
  readonly onJump?: (ms: number) => void;
}

type VisiblePitEntry = {
  entry: Pit;
  dateMs: number;
};

type LapGroup = {
  lapNumber: number | null;
  entries: VisiblePitEntry[];
};

export function PitFeed({
  entries,
  stints,
  sessionKey = null,
  sessionType,
  drivers,
  sessionTimeMs,
  sessionStartMs,
  showAllItems = false,
  phaseLookup = () => null,
  onJump,
}: Props) {
  const showCsvExportButtons = useSettings((s) => s.showCsvExportButtons);
  const [renderLimit, setRenderLimit] = useState(120);
  const currentT = sessionStartMs + sessionTimeMs;

  useEffect(() => {
    setRenderLimit(120);
  }, [sessionKey, entries.length]);

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  const stintsByDriver = useMemo(() => {
    const byDriver = new Map<number, Stint[]>();
    for (const stint of stints) {
      const driverStints = byDriver.get(stint.driver_number) ?? [];
      driverStints.push(stint);
      byDriver.set(stint.driver_number, driverStints);
    }
    for (const driverStints of byDriver.values()) {
      driverStints.sort((a, b) => a.lap_start - b.lap_start);
    }
    return byDriver;
  }, [stints]);

  const datedEntries = useMemo(
    () =>
      entries
        .map((entry) => ({ entry, dateMs: new Date(entry.date).getTime() }))
        .sort((a, b) => a.dateMs - b.dateMs),
    [entries],
  );

  const visibleAll = useMemo(() => {
    if (showAllItems) return [...datedEntries].reverse();
    const endIndex = upperBoundByValue(datedEntries, currentT, (e) => e.dateMs);
    return endIndex > 0 ? datedEntries.slice(0, endIndex).reverse() : [];
  }, [datedEntries, currentT, showAllItems]);

  const visible = useMemo<VisiblePitEntry[]>(
    () => visibleAll.slice(0, renderLimit),
    [visibleAll, renderLimit],
  );
  const hasMore = visible.length < visibleAll.length;

  // Fastest stop so far (no spoilers past the playhead unless "All").
  const fastest = useMemo(() => {
    let best: { entry: Pit; stop: number } | null = null;
    for (const { entry } of visibleAll) {
      const stop = pitStopTime(entry);
      if (stop === null || stop <= 0) continue;
      if (!best || stop < best.stop) best = { entry, stop };
    }
    return best;
  }, [visibleAll]);

  const summaryStats = useMemo((): CommentaryStat[] => {
    const stops = visibleAll
      .map(({ entry }) => pitStopTime(entry))
      .filter((s): s is number => s !== null && s > 0);
    const stats: CommentaryStat[] = [
      { key: "stops", label: "Stops", value: visibleAll.length },
    ];
    if (fastest) {
      stats.push({
        key: "fastest",
        label: "Fastest",
        value: `${formatPitDuration(fastest.stop) ?? "--"}s`,
        accent: "#9b59f5",
        detail: (
          <DriverChip
            driver={driverByNumber.get(fastest.entry.driver_number)}
            driverNumber={fastest.entry.driver_number}
          />
        ),
      });
    }
    if (stops.length > 1) {
      const avg = stops.reduce((sum, s) => sum + s, 0) / stops.length;
      stats.push({
        key: "average",
        label: "Average",
        value: `${formatPitDuration(avg) ?? "--"}s`,
        detail: `${stops.length} timed`,
      });
    }
    return stats;
  }, [visibleAll, fastest, driverByNumber]);

  const lapGroups = useMemo<LapGroup[]>(() => {
    const isQualifying = sessionType?.toLowerCase().includes("qualifying");
    const isPractice = sessionType ? isPracticeSession(sessionType) : false;
    const groups: LapGroup[] = [];

    for (const item of visible) {
      let lapNumber: number | null;
      if (isPractice) {
        lapNumber = null;
      } else if (isQualifying) {
        lapNumber = phaseLookup(item.dateMs - sessionStartMs);
      } else {
        lapNumber = item.entry.lap_number ?? null;
      }

      const current = groups.at(-1);
      if (current?.lapNumber !== lapNumber) {
        groups.push({ lapNumber, entries: [item] });
      } else {
        current.entries.push(item);
      }
    }
    return groups;
  }, [visible, sessionType, phaseLookup, sessionStartMs]);

  if (visible.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        {sessionStartMs
          ? "No pit stops yet - scrub forward"
          : "Select a session"}
      </div>
    );
  }

  return (
    <div className={COMMENTARY_FEED_SCROLL_CLASS}>
      {sessionKey !== null && showCsvExportButtons && (
        <div className="flex justify-end pb-1">
          <button
            type="button"
            onClick={() => {
              void downloadEndpointCsv(
                "pit",
                { session_key: sessionKey },
                `pit_stops_${sessionKey}.csv`,
              );
            }}
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-panel text-muted hover:text-white hover:bg-track"
            aria-label="Export pit stops CSV"
          >
            Export CSV
          </button>
        </div>
      )}

      <CommentarySummary stats={summaryStats} />

      {lapGroups.map((group, groupIndex) => (
        <div
          key={`${group.lapNumber ?? "session"}-${groupIndex}`}
          className={COMMENTARY_GROUP_CLASS}
        >
          <CommentaryGroupHeader
            label={commentaryGroupLabel(sessionType, group.lapNumber)}
            count={group.entries.length}
          />
          <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
            {group.entries.map(({ entry, dateMs }, idx) => {
              const driver = driverByNumber.get(entry.driver_number);
              const color = teamColor(driver?.team_colour);
              const ms = dateMs - sessionStartMs;
              const stop = pitStopTime(entry);
              const lane = laneDuration(entry);
              const nextStint = stintsByDriver
                .get(entry.driver_number)
                ?.find((stint) => stint.lap_start > entry.lap_number);
              const isFastest = fastest?.entry === entry;
              const isFresh = isFreshCommentaryItem(
                sessionTimeMs - ms,
                showAllItems,
                COMMENTARY_FRESH_MS,
              );

              return (
                <div
                  key={`${entry.driver_number}-${entry.lap_number}-${entry.date}-${idx}`}
                  className={`${COMMENTARY_ROW_CLASS} ${
                    isFastest ? "!bg-f1-purple/10" : ""
                  } ${isFresh ? COMMENTARY_FRESH_ROW_CLASS : ""}`}
                  style={{ borderLeft: `6px solid ${color}` }}
                >
                  <span className={COMMENTARY_TIME_CLASS}>
                    {formatSessionElapsedTime(ms)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`${COMMENTARY_TITLE_CLASS} flex items-center gap-1.5`}
                    >
                      <span className="text-white/55">Pit stop</span>
                      <DriverChip
                        driver={driver}
                        driverNumber={entry.driver_number}
                      />
                      {stop !== null && (
                        <span
                          className={`ml-auto font-mono text-[12px] font-black tabular-nums ${
                            isFastest ? "text-f1-purple" : stopTimeClass(entry, stop)
                          }`}
                        >
                          {formatPitDuration(stop) ?? "--"}s
                        </span>
                      )}
                    </div>
                    <div className={COMMENTARY_META_CLASS}>
                      <span
                        className={`${COMMENTARY_BADGE_CLASS} gap-1 bg-[#f5a623] text-black`}
                      >
                        <Timer
                          size={10}
                          strokeWidth={3}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                        Pit
                      </span>
                      {isFastest && (
                        <span
                          className={`${COMMENTARY_BADGE_CLASS} gap-1 bg-f1-purple text-white`}
                        >
                          <Trophy
                            size={10}
                            strokeWidth={3}
                            className="shrink-0"
                            aria-hidden="true"
                          />
                          Fastest
                        </span>
                      )}
                      {lane !== null && (
                        <span className="font-mono tabular-nums text-white/70">
                          Lane {formatPitDuration(lane) ?? "--:--:---"}
                        </span>
                      )}
                      {nextStint && (
                        <div className="inline-flex max-w-full shrink-0 items-center gap-2 whitespace-nowrap rounded bg-white/[0.04] px-1.5 py-0.5">
                          <div className="w-10 shrink-0">
                            <TyreBadge
                              stints={stints}
                              driverNumber={entry.driver_number}
                              currentLap={nextStint.lap_start}
                            />
                          </div>
                          <span className="whitespace-nowrap font-mono tabular-nums text-white/70">
                            Stint {nextStint.stint_number} · L
                            {nextStint.lap_start}–{nextStint.lap_end}
                          </span>
                        </div>
                      )}
                      {isFresh && <FreshTag />}
                    </div>
                  </div>
                  {onJump && (
                    <CommentaryJumpButton
                      ms={ms}
                      label={`pit stop for ${driver?.name_acronym ?? entry.driver_number}`}
                      onJump={onJump}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setRenderLimit((v) => v + 120)}
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-panel text-muted hover:text-white hover:bg-track"
          >
            Load older ({visibleAll.length - visible.length} left)
          </button>
        </div>
      )}
    </div>
  );
}
