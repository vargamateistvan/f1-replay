import { useEffect, useMemo, useState } from "react";
import type { Overtake, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";

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

function fmtSessionTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

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
    const groups: LapGroup[] = [];

    for (const item of visible) {
      let groupKey: number | null;
      if (isQualifying) {
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
    <div className="panel-scroll px-2 pb-2 space-y-1">
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
      {lapGroups.map((group) => {
        const isQualifying = sessionType?.toLowerCase().includes("qualifying");
        const headerText =
          isQualifying && group.lapNumber !== null
            ? `Q${group.lapNumber}`
            : group.lapNumber !== null
              ? `Lap ${group.lapNumber}`
              : "Session";
        return (
          <div key={group.lapNumber ?? "session"} className="mb-0.5">
            <div className="sticky top-0 z-10 border-b border-panel bg-surface px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none">
              {headerText}
            </div>
            {group.entries.map(({ entry: e, dateMs, lapNumber }) => {
              const over = driverByNumber.get(e.overtaking_driver_number);
              const under = driverByNumber.get(e.overtaken_driver_number);
              const overColor = teamColor(over?.team_colour);
              const underColor = teamColor(under?.team_colour);
              const ms = dateMs - sessionStartMs;
              return (
                <div
                  key={`${e.overtaking_driver_number}-${e.overtaken_driver_number}-${e.date}-${e.position ?? "na"}`}
                  className="mb-0.5 flex items-start gap-3 border-b border-panel px-2 py-2.5 text-xs transition-colors hover:bg-white/[0.04]"
                  style={{ borderLeft: `2px solid ${overColor}` }}
                >
                  <span className="w-10 shrink-0 text-[10px] font-mono tabular-nums text-muted">
                    {fmtSessionTime(ms)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-white/90">
                      <span style={{ color: overColor }}>
                        {over?.name_acronym ?? e.overtaking_driver_number}
                      </span>{" "}
                      <span className="text-white/55">passed</span>{" "}
                      <span style={{ color: underColor }}>
                        {under?.name_acronym ?? e.overtaken_driver_number}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                      <span className="inline-flex h-5 w-fit max-w-full shrink-0 items-center justify-center rounded px-1.5 whitespace-nowrap text-center text-[8px] font-black uppercase tracking-widest leading-none bg-green-500/20 text-green-300">
                        Pass
                      </span>
                      {e.position !== null && <span>for P{e.position}</span>}
                      {lapNumber !== null && <span>Lap {lapNumber}</span>}
                      <span className="font-black uppercase tracking-widest text-white/80">
                        {over?.name_acronym ?? e.overtaking_driver_number} vs{" "}
                        {under?.name_acronym ?? e.overtaken_driver_number}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-muted text-[10px]">›</span>
                </div>
              );
            })}
          </div>
        );
      })}
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
