import { useEffect, useMemo, useState } from "react";
import type { Driver, Pit } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { formatPitDuration, laneDuration, pitStopTime } from "@/utils/pit";
import { upperBoundByValue } from "@/utils/sortedTime";
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

interface Props {
  readonly entries: Pit[];
  readonly sessionKey?: number | null;
  readonly sessionType?: string;
  readonly drivers: Driver[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly showAllItems?: boolean;
  readonly phaseLookup?: (ms: number) => number | null;
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
  sessionKey = null,
  sessionType,
  drivers,
  sessionTimeMs,
  sessionStartMs,
  showAllItems = false,
  phaseLookup = () => null,
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

      {lapGroups.map((group, groupIndex) => (
        <div
          key={`${group.lapNumber ?? "session"}-${groupIndex}`}
          className={COMMENTARY_GROUP_CLASS}
        >
          <div className={COMMENTARY_GROUP_HEADER_CLASS}>
            {commentaryGroupLabel(sessionType, group.lapNumber)}
          </div>
          <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
            {group.entries.map(({ entry, dateMs }, idx) => {
              const driver = driverByNumber.get(entry.driver_number);
              const color = teamColor(driver?.team_colour);
              const ms = dateMs - sessionStartMs;
              const stop = pitStopTime(entry);
              const lane = laneDuration(entry);

              return (
                <div
                  key={`${entry.driver_number}-${entry.lap_number}-${entry.date}-${idx}`}
                  className={COMMENTARY_ROW_CLASS}
                  style={{ borderLeft: `6px solid ${color}` }}
                >
                  <span className={COMMENTARY_TIME_CLASS}>
                    {formatSessionElapsedTime(ms)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={COMMENTARY_TITLE_CLASS}>
                      Pit stop for{" "}
                      <span style={{ color }}>
                        {driver?.name_acronym ?? entry.driver_number}
                      </span>
                    </div>
                    <div className={COMMENTARY_META_CLASS}>
                      <span
                        className={`${COMMENTARY_BADGE_CLASS} bg-[#f5a623] text-black`}
                      >
                        Pit
                      </span>
                      {stop !== null && (
                        <span className="font-mono tabular-nums text-white/90">
                          Stop {formatPitDuration(stop) ?? "--:--:---"}
                        </span>
                      )}
                      {lane !== null && (
                        <span className="font-mono tabular-nums text-white/70">
                          Lane {formatPitDuration(lane) ?? "--:--:---"}
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
