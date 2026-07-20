import { useEffect, useMemo, useState } from "react";
import type { Overtake, Driver } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";

interface Props {
  readonly entries: Overtake[];
  readonly sessionKey?: number | null;
  readonly drivers: Driver[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

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

  const visibleAll = useMemo(() => {
    const entriesInView = entries.filter(
      (e) => new Date(e.date).getTime() <= currentT,
    );
    if (entriesInView.length === 0) return [];

    // If the playhead is at/after the latest pass event (e.g. jumped to end),
    // expose the full feed instead of the rolling last-N window.
    const latestEntry = entriesInView.at(-1);
    if (!latestEntry) return [];
    const latestEntryMs = new Date(latestEntry.date).getTime();
    const showAll = currentT >= latestEntryMs;

    return showAll
      ? [...entriesInView].reverse()
      : entriesInView.slice(-40).reverse();
  }, [entries, currentT]);

  const visible = useMemo(
    () => visibleAll.slice(0, renderLimit),
    [visibleAll, renderLimit],
  );
  const hasMore = visible.length < visibleAll.length;

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
    <div className="panel-scroll p-2 space-y-1">
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
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-[#1e1e28] text-muted hover:text-white hover:bg-[#38383f]"
            aria-label="Export overtakes CSV"
          >
            Export CSV
          </button>
        </div>
      )}
      {visible.map((e) => {
        const over = driverByNumber.get(e.overtaking_driver_number);
        const under = driverByNumber.get(e.overtaken_driver_number);
        const overColor = teamColor(over?.team_colour);
        const underColor = teamColor(under?.team_colour);
        const ms = new Date(e.date).getTime() - sessionStartMs;
        return (
          <div
            key={`${e.overtaking_driver_number}-${e.overtaken_driver_number}-${e.date}-${e.position ?? "na"}`}
            className="flex items-center gap-2 border-b border-[#2a2a35] pb-1.5 pt-0.5 text-xs"
          >
            <span className="text-[#39d743] text-[10px]">▲</span>
            <span className="font-black" style={{ color: overColor }}>
              {over?.name_acronym ?? e.overtaking_driver_number}
            </span>
            <span className="text-muted text-[10px]">passed</span>
            <span className="font-black" style={{ color: underColor }}>
              {under?.name_acronym ?? e.overtaken_driver_number}
            </span>
            {e.position !== null && (
              <span className="text-muted text-[10px]">for P{e.position}</span>
            )}
            <span className="ml-auto text-muted font-mono tabular-nums text-[10px]">
              {fmtSessionTime(ms)}
            </span>
          </div>
        );
      })}
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
