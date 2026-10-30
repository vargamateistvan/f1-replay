import { useEffect, useMemo, useState } from "react";
import type { Driver, Pit, Stint } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { TyreBadge } from "@/components/LiveTiming/TyreBadge";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { formatPitDuration, laneDuration, pitStopTime } from "@/utils/pit";
import { formatBattleGain, pitBattleHeadline, type PitBattle } from "@/utils/undercut";
import { upperBoundByValue } from "@/utils/sortedTime";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_BUTTON_CLASS,
  COMMENTARY_EMPTY_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_META_CLASS,
  commentaryGroupLabel,
} from "@/components/CommentaryPanels/commentaryList";
import {
  CommentaryDriver,
  CommentaryRow,
} from "@/components/CommentaryPanels/CommentaryRow";

interface Props {
  readonly entries: Pit[];
  /** Undercut / overcut battles, shown on the first stopper's row. */
  readonly pitBattles?: PitBattle[];
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

const NO_PIT_BATTLES: PitBattle[] = [];

type LapGroup = {
  lapNumber: number | null;
  entries: VisiblePitEntry[];
};

export function PitFeed({
  entries,
  pitBattles = NO_PIT_BATTLES,
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

  const battlesByStop = useMemo(() => {
    const byStop = new Map<string, PitBattle[]>();
    for (const battle of pitBattles) {
      const key = `${battle.firstStopper}:${battle.firstStopLap}`;
      byStop.set(key, [...(byStop.get(key) ?? []), battle]);
    }
    return byStop;
  }, [pitBattles]);

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
      <div className={COMMENTARY_EMPTY_CLASS}>
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
            className={COMMENTARY_BUTTON_CLASS}
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
              const nextStint = stintsByDriver
                .get(entry.driver_number)
                ?.find((stint) => stint.lap_start > entry.lap_number);

              return (
                <CommentaryRow
                  key={`${entry.driver_number}-${entry.lap_number}-${entry.date}-${idx}`}
                  ms={ms}
                  badge={{ label: "Pit", className: "bg-orange text-black" }}
                  accent={color}
                  upcoming={ms > sessionTimeMs}
                  title={
                    <CommentaryDriver
                      driver={driver}
                      driverNumber={entry.driver_number}
                      showName
                    />
                  }
                  meta={
                    stop !== null || lane !== null || nextStint ? (
                      <>
                        {stop !== null && (
                          <span className="text-fg/90">
                            Stop {formatPitDuration(stop) ?? "--:--:---"}
                          </span>
                        )}
                        {lane !== null && (
                          <span className="text-fg/70">
                            Lane {formatPitDuration(lane) ?? "--:--:---"}
                          </span>
                        )}
                        {nextStint && (
                          <span className="inline-flex max-w-full shrink-0 items-center gap-2 whitespace-nowrap">
                            <span className="w-10 shrink-0">
                              <TyreBadge
                                stints={stints}
                                driverNumber={entry.driver_number}
                                currentLap={nextStint.lap_start}
                              />
                            </span>
                            <span className="text-fg/70">
                              Stint {nextStint.stint_number} · L
                              {nextStint.lap_start}–{nextStint.lap_end}
                            </span>
                          </span>
                        )}
                      </>
                    ) : undefined
                  }
                  jumpLabel={`pit stop for ${driver?.name_acronym ?? entry.driver_number}`}
                  onJump={onJump}
                >
                  {battlesByStop
                    .get(`${entry.driver_number}:${entry.lap_number}`)
                    ?.map((battle) => (
                      <PitBattleLine
                        key={battle.id}
                        battle={battle}
                        driverByNumber={driverByNumber}
                      />
                    ))}
                </CommentaryRow>
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

function PitBattleLine({
  battle,
  driverByNumber,
}: {
  battle: PitBattle;
  driverByNumber: Map<number, Driver>;
}) {
  const attacker = driverByNumber.get(battle.attacker);
  const defender = driverByNumber.get(battle.defender);
  const rivalNumber = battle.firstStopper === battle.attacker ? battle.defender : battle.attacker;
  const rival = driverByNumber.get(rivalNumber);
  const tone =
    battle.attackerAheadAfter === null
      ? "bg-fg/10 text-fg/80"
      : battle.attackerAheadAfter
        ? "bg-teal text-black"
        : "bg-fg/20 text-fg";
  return (
    <span className={`${COMMENTARY_META_CLASS} mt-1.5`}>
      <span className={`${COMMENTARY_BADGE_CLASS} ${tone}`}>
        {pitBattleHeadline(battle)}
      </span>
      <span>
        <span style={{ color: teamColor(attacker?.team_colour) }}>
          {attacker?.name_acronym ?? battle.attacker}
        </span>{" "}
        vs{" "}
        <span style={{ color: teamColor(defender?.team_colour) }}>
          {defender?.name_acronym ?? battle.defender}
        </span>
      </span>
      {battle.attackerGainS !== null ? (
        <span className="font-mono tabular-nums text-fg/70">
          {formatBattleGain(battle.attackerGainS)}
        </span>
      ) : (
        <span className="text-fg/50">
          {battle.rivalStopLap === null
            ? `${rival?.name_acronym ?? rivalNumber} still out`
            : "out-lap"}
        </span>
      )}
      {battle.neutralised && (
        <span className="text-fg/50" title="A Safety Car, VSC or red flag affected this">
          SC/VSC
        </span>
      )}
    </span>
  );
}
