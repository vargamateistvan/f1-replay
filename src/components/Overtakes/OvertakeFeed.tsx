import { useEffect, useMemo, useState } from "react";
import { ChevronsRight, Crown } from "lucide-react";
import type { Overtake, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { COMMENTARY_FRESH_MS } from "@/constants";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
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

const LEAD_GOLD = "#f5c518";

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

  const summaryStats = useMemo((): CommentaryStat[] => {
    const byDriver = new Map<number, number>();
    let leadChanges = 0;
    for (const { entry } of visibleAll) {
      const num = entry.overtaking_driver_number;
      byDriver.set(num, (byDriver.get(num) ?? 0) + 1);
      if (entry.position === 1) leadChanges++;
    }
    const stats: CommentaryStat[] = [
      { key: "passes", label: "Passes", value: visibleAll.length },
    ];
    let top: [number, number] | null = null;
    for (const pair of byDriver) {
      if (!top || pair[1] > top[1]) top = pair;
    }
    // A single pass each isn't a "most" — only show a clear leader.
    if (top && top[1] >= 2) {
      stats.push({
        key: "top",
        label: "Most passes",
        value: `×${top[1]}`,
        accent: "#39b54a",
        detail: (
          <DriverChip driver={driverByNumber.get(top[0])} driverNumber={top[0]} />
        ),
      });
    }
    stats.push({
      key: "lead",
      label: "For the lead",
      value: leadChanges,
      accent: leadChanges > 0 ? LEAD_GOLD : undefined,
    });
    return stats;
  }, [visibleAll, driverByNumber]);

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
      <div className="text-muted text-xs p-3">
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
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-panel text-muted hover:text-white hover:bg-track"
            aria-label="Export overtakes CSV"
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
            {group.entries.map(({ entry: e, dateMs }) => {
              const over = driverByNumber.get(e.overtaking_driver_number);
              const under = driverByNumber.get(e.overtaken_driver_number);
              const overColor = teamColor(over?.team_colour);
              const ms = dateMs - sessionStartMs;
              const isLead = e.position === 1;
              const isFresh = isFreshCommentaryItem(
                sessionTimeMs - ms,
                showAllItems,
                COMMENTARY_FRESH_MS,
              );
              return (
                <div
                  key={`${e.overtaking_driver_number}-${e.overtaken_driver_number}-${e.date}-${e.position ?? "na"}`}
                  className={`${COMMENTARY_ROW_CLASS} ${
                    isLead ? "!bg-[#f5c518]/10" : ""
                  } ${isFresh ? COMMENTARY_FRESH_ROW_CLASS : ""}`}
                  style={{ borderLeft: `6px solid ${overColor}` }}
                >
                  <span className={COMMENTARY_TIME_CLASS}>
                    {formatSessionElapsedTime(ms)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`${COMMENTARY_TITLE_CLASS} flex items-center gap-1.5`}
                    >
                      <DriverChip
                        driver={over}
                        driverNumber={e.overtaking_driver_number}
                      />
                      <ChevronsRight
                        size={14}
                        strokeWidth={2.5}
                        className="shrink-0 text-f1-green"
                        aria-label="passed"
                      />
                      <span className="opacity-70">
                        <DriverChip
                          driver={under}
                          driverNumber={e.overtaken_driver_number}
                        />
                      </span>
                    </div>
                    <div className={COMMENTARY_META_CLASS}>
                      <span
                        className={`${COMMENTARY_BADGE_CLASS} bg-[#39b54a] text-white`}
                      >
                        Pass
                      </span>
                      {isLead && (
                        <span
                          className={`${COMMENTARY_BADGE_CLASS} gap-1 text-black`}
                          style={{ backgroundColor: LEAD_GOLD }}
                        >
                          <Crown
                            size={10}
                            strokeWidth={3}
                            className="shrink-0"
                            aria-hidden="true"
                          />
                          Lead
                        </span>
                      )}
                      {e.position !== null && (
                        <span className="font-mono font-bold tabular-nums text-white/80">
                          for P{e.position}
                        </span>
                      )}
                      {isFresh && <FreshTag />}
                    </div>
                  </div>
                  {onJump && (
                    <CommentaryJumpButton
                      ms={ms}
                      label={`${over?.name_acronym ?? e.overtaking_driver_number} passing ${under?.name_acronym ?? e.overtaken_driver_number}`}
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
