import { useEffect, useMemo, useState } from "react";
import type { Driver, Pit } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { laneDuration, pitStopTime } from "@/utils/pit";
import { upperBoundByValue } from "@/utils/sortedTime";

interface Props {
  readonly entries: Pit[];
  readonly sessionKey?: number | null;
  readonly drivers: Driver[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

type VisiblePitEntry = {
  entry: Pit;
  dateMs: number;
};

type LapGroup = {
  lapNumber: number | null;
  entries: VisiblePitEntry[];
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

export function PitFeed({
  entries,
  sessionKey = null,
  drivers,
  sessionTimeMs,
  sessionStartMs,
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
    const endIndex = upperBoundByValue(datedEntries, currentT, (e) => e.dateMs);
    const entriesInView = endIndex > 0 ? datedEntries.slice(0, endIndex) : [];
    if (entriesInView.length === 0) return [];

    const latestEntry = entriesInView.at(-1);
    if (!latestEntry) return [];
    const showAll = currentT >= latestEntry.dateMs;

    return showAll
      ? [...entriesInView].reverse()
      : entriesInView.slice(-40).reverse();
  }, [datedEntries, currentT]);

  const visible = useMemo<VisiblePitEntry[]>(
    () => visibleAll.slice(0, renderLimit),
    [visibleAll, renderLimit],
  );
  const hasMore = visible.length < visibleAll.length;

  const lapGroups = useMemo<LapGroup[]>(() => {
    const groups: LapGroup[] = [];
    for (const item of visible) {
      const lapNumber = item.entry.lap_number ?? null;
      const current = groups.at(-1);
      if (!current || current.lapNumber !== lapNumber) {
        groups.push({ lapNumber, entries: [item] });
      } else {
        current.entries.push(item);
      }
    }
    return groups;
  }, [visible]);

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
    <div className="panel-scroll px-2 pb-2 space-y-1">
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
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-[#1e1e28] text-muted hover:text-white hover:bg-[#38383f]"
            aria-label="Export pit stops CSV"
          >
            Export CSV
          </button>
        </div>
      )}

      {lapGroups.map((group) => (
        <div key={group.lapNumber ?? "session"} className="mb-0.5">
          <div className="sticky top-0 z-10 border-b border-[#2a2a35] bg-[#1a1a24] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none">
            {group.lapNumber !== null ? `Lap ${group.lapNumber}` : "Session"}
          </div>
          {group.entries.map(({ entry, dateMs }, idx) => {
            const driver = driverByNumber.get(entry.driver_number);
            const color = teamColor(driver?.team_colour);
            const ms = dateMs - sessionStartMs;
            const stop = pitStopTime(entry);
            const lane = laneDuration(entry);

            return (
              <div
                key={`${entry.driver_number}-${entry.lap_number}-${entry.date}-${idx}`}
                className="flex items-center gap-3 border-b border-[#2a2a35] px-2 py-2.5 text-xs transition-colors hover:bg-white/[0.04]"
              >
                <span className="w-10 shrink-0 text-[10px] font-mono tabular-nums text-muted">
                  {fmtSessionTime(ms)}
                </span>
                <span className="shrink-0 bg-[#f5a623] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-black">
                  Pit
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[11px] font-bold"
                    style={{ color }}
                  >
                    {driver?.name_acronym ?? entry.driver_number}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                    <span>Lap {entry.lap_number}</span>
                    {stop !== null && (
                      <span className="font-mono tabular-nums text-white/90">
                        Stop {stop.toFixed(1)}s
                      </span>
                    )}
                    {lane !== null && (
                      <span className="font-mono tabular-nums text-white/70">
                        Lane {lane.toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-muted text-[10px]">›</span>
              </div>
            );
          })}
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setRenderLimit((v) => v + 120)}
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-[#1e1e28] text-muted hover:text-white hover:bg-[#38383f]"
          >
            Load older ({visibleAll.length - visible.length} left)
          </button>
        </div>
      )}
    </div>
  );
}
