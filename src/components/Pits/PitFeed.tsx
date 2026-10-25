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
  COMMENTARY_TIME_CLASS,
  COMMENTARY_TITLE_CLASS,
  commentaryGroupLabel,
  formatSessionElapsedTime,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryJumpButton } from "@/components/CommentaryPanels/CommentaryJumpButton";

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
                <div
                  key={`${entry.driver_number}-${entry.lap_number}-${entry.date}-${idx}`}
                  className={COMMENTARY_ROW_CLASS}
                >
                  <span
                    aria-hidden="true"
                    className={COMMENTARY_ACCENT_CLASS}
                    style={{ backgroundColor: color }}
                  />
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
                      {nextStint && (
                        <div className="inline-flex max-w-full shrink-0 items-center gap-2 whitespace-nowrap border border-panel bg-track px-1.5 py-0.5">
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
                    </div>
                    {battlesByStop
                      .get(`${entry.driver_number}:${entry.lap_number}`)
                      ?.map((battle) => (
                        <PitBattleLine
                          key={battle.id}
                          battle={battle}
                          driverByNumber={driverByNumber}
                        />
                      ))}
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
      ? "bg-white/10 text-white/80"
      : battle.attackerAheadAfter
        ? "bg-[#14b8a6] text-black"
        : "bg-white/20 text-white";
  return (
    <div className={`${COMMENTARY_META_CLASS} mt-0.5`}>
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
        <span className="font-mono tabular-nums text-white/70">
          {formatBattleGain(battle.attackerGainS)}
        </span>
      ) : (
        <span className="text-white/50">
          {battle.rivalStopLap === null
            ? `${rival?.name_acronym ?? rivalNumber} still out`
            : "out-lap"}
        </span>
      )}
      {battle.neutralised && (
        <span className="text-white/50" title="A Safety Car, VSC or red flag affected this">
          SC/VSC
        </span>
      )}
    </div>
  );
}
