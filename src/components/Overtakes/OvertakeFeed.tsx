import { useEffect, useMemo, useState } from "react";
import type { Overtake, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_BUTTON_CLASS,
  COMMENTARY_EMPTY_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  commentaryGroupLabel,
} from "@/components/CommentaryPanels/commentaryList";
import {
  CommentaryDriver,
  CommentaryRow,
} from "@/components/CommentaryPanels/CommentaryRow";

interface Props {
  readonly entries: Overtake[];
  readonly sessionKey?: number | null;
  readonly sessionType?: string;
  readonly drivers: Driver[];
  readonly laps?: Lap[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly showAllItems?: boolean;
  readonly phaseLookup?: (ms: number) => number | null;
  readonly onJump?: (ms: number) => void;
}

type VisibleOvertakeEntry = {
  entry: Overtake;
  dateMs: number;
  lapNumber: number | null;
};

type LapGroup = {
  lapNumber: number | null;
  entries: VisibleOvertakeEntry[];
};

export function OvertakeFeed({
  entries,
  sessionKey = null,
  sessionType,
  drivers,
  laps = [],
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

  const lapLookup = useMemo(
    () => buildLapLookup(laps, sessionStartMs),
    [laps, sessionStartMs],
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

  const visible = useMemo<VisibleOvertakeEntry[]>(
    () =>
      visibleAll.slice(0, renderLimit).map(({ entry, dateMs }) => ({
        entry,
        dateMs,
        lapNumber: lapNumberAtMs(lapLookup, dateMs - sessionStartMs),
      })),
    [visibleAll, renderLimit, lapLookup, sessionStartMs],
  );
  const hasMore = visible.length < visibleAll.length;

  const lapGroups = useMemo<LapGroup[]>(() => {
    const isQualifying = sessionType?.toLowerCase().includes("qualifying");
    const isPractice = sessionType ? isPracticeSession(sessionType) : false;
    const groups: LapGroup[] = [];

    for (const item of visible) {
      let groupKey: number | null;
      if (isPractice) {
        groupKey = null;
      } else if (isQualifying) {
        groupKey = phaseLookup(item.dateMs - sessionStartMs);
      } else {
        groupKey = item.lapNumber;
      }

      const current = groups.at(-1);
      if (current?.lapNumber !== groupKey) {
        groups.push({ lapNumber: groupKey, entries: [item] });
      } else {
        current.entries.push(item);
      }
    }
    return groups;
  }, [visible, sessionType, phaseLookup, sessionStartMs]);

  if (visible.length === 0) {
    return (
      <div className={COMMENTARY_EMPTY_CLASS}>
        {sessionStartMs
          ? "No overtakes yet — scrub forward"
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
                "overtakes",
                { session_key: sessionKey },
                `overtakes_${sessionKey}.csv`,
              );
            }}
            className={COMMENTARY_BUTTON_CLASS}
            aria-label="Export overtakes CSV"
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
            {group.entries.map(({ entry: e, dateMs }) => {
              const over = driverByNumber.get(e.overtaking_driver_number);
              const under = driverByNumber.get(e.overtaken_driver_number);
              const ms = dateMs - sessionStartMs;
              return (
                <CommentaryRow
                  key={`${e.overtaking_driver_number}-${e.overtaken_driver_number}-${e.date}-${e.position ?? "na"}`}
                  ms={ms}
                  badge={{ label: "Pass", className: "bg-green text-white" }}
                  accent={teamColor(over?.team_colour)}
                  upcoming={ms > sessionTimeMs}
                  title={
                    <>
                      <CommentaryDriver
                        driver={over}
                        driverNumber={e.overtaking_driver_number}
                      />{" "}
                      <span className="font-normal text-muted">passed</span>{" "}
                      <CommentaryDriver
                        driver={under}
                        driverNumber={e.overtaken_driver_number}
                      />
                    </>
                  }
                  meta={
                    e.position !== null ? <span>for P{e.position}</span> : undefined
                  }
                  jumpLabel={`${over?.name_acronym ?? e.overtaking_driver_number} passing ${under?.name_acronym ?? e.overtaken_driver_number}`}
                  onJump={onJump}
                />
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
            className={COMMENTARY_BUTTON_CLASS}
          >
            Load older ({visibleAll.length - visible.length} left)
          </button>
        </div>
      )}
    </div>
  );
}
