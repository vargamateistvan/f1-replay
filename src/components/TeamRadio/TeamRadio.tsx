import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import type { TeamRadio as TeamRadioEntry, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";

interface Props {
  readonly entries: TeamRadioEntry[];
  readonly sessionKey?: number | null;
  readonly sessionYear?: number | null;
  readonly drivers: Driver[];
  readonly laps?: Lap[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

function fmtSessionTime(entryDateMs: number, sessionStartMs: number) {
  const elapsed = Math.max(0, entryDateMs - sessionStartMs);
  const s = Math.floor(elapsed / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

export function TeamRadioFeed({
  entries,
  sessionKey = null,
  sessionYear = null,
  drivers,
  laps = [],
  sessionTimeMs,
  sessionStartMs,
}: Props) {
  const showCsvExportButtons = useSettings((s) => s.showCsvExportButtons);
  const [playing, setPlaying] = useState<string | null>(null);
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
    const endIndex = upperBoundByValue(datedEntries, currentT, (e) => e.dateMs);
    const entriesInView = endIndex > 0 ? datedEntries.slice(0, endIndex) : [];
    if (entriesInView.length === 0) return [];

    // If the playhead is at/after the latest radio event (e.g. jumped to end),
    // expose the full feed instead of the rolling last-N window.
    const latestEntry = entriesInView.at(-1);
    if (!latestEntry) return [];
    const showAll = currentT >= latestEntry.dateMs;

    return showAll
      ? [...entriesInView].reverse()
      : entriesInView.slice(-30).reverse();
  }, [datedEntries, currentT]);

  const visible = useMemo(
    () => visibleAll.slice(0, renderLimit),
    [visibleAll, renderLimit],
  );
  const hasMore = visible.length < visibleAll.length;

  let emptyMessage = "Select a session";
  if (sessionStartMs !== 0) {
    if (sessionYear !== null && sessionYear >= 2026) {
      emptyMessage =
        "No radio messages for this session. OpenF1 coverage is often limited in 2026+ events.";
    } else {
      emptyMessage = "No radio messages yet — scrub forward";
    }
  }

  function play(url: string) {
    if (playing === url) {
      setPlaying(null);
      return;
    }
    setPlaying(url);
  }

  if (visible.length === 0) {
    return <div className="text-muted text-xs p-3">{emptyMessage}</div>;
  }

  return (
    <div className="panel-scroll p-2 space-y-1">
      {sessionKey !== null && showCsvExportButtons && (
        <div className="flex justify-end pb-1">
          <button
            type="button"
            onClick={() => {
              void downloadEndpointCsv(
                "team_radio",
                { session_key: sessionKey },
                `team_radio_${sessionKey}.csv`,
              );
            }}
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-[#1e1e28] text-muted hover:text-white hover:bg-[#38383f]"
            aria-label="Export team radio CSV"
          >
            Export CSV
          </button>
        </div>
      )}
      {visible.map(({ entry: e, dateMs: entryMs }) => {
        const driver = driverByNumber.get(e.driver_number);
        const color = teamColor(driver?.team_colour);
        const isPlaying = playing === e.recording_url;
        const lapNumber = lapNumberAtMs(lapLookup, entryMs - sessionStartMs);
        return (
          <div
            key={`${e.driver_number}-${e.date}-${e.recording_url}`}
            className="flex items-start gap-2 border-b border-[#2a2a35] pb-1.5 pt-0.5"
          >
            {/* Team colour bar */}
            <span
              className="w-[3px] self-stretch shrink-0"
              style={{ background: color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs" style={{ color }}>
                  {driver?.name_acronym ?? e.driver_number}
                </span>
                {lapNumber !== null && (
                  <span className="text-muted text-[10px]">
                    Lap {lapNumber}
                  </span>
                )}
                <span className="text-muted font-mono tabular-nums text-[10px]">
                  {fmtSessionTime(entryMs, sessionStartMs)}
                </span>
              </div>
              <div className="mt-1">
                <button
                  onClick={() => play(e.recording_url)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    isPlaying
                      ? "bg-f1red text-white"
                      : "bg-panel text-muted hover:text-white hover:bg-[#38383f]"
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Square size={11} strokeWidth={2.4} aria-hidden="true" />{" "}
                      Stop
                    </>
                  ) : (
                    <>
                      <Play size={11} strokeWidth={2.4} aria-hidden="true" />{" "}
                      Play
                    </>
                  )}
                </button>
                {isPlaying && (
                  <audio
                    key={e.recording_url}
                    src={e.recording_url}
                    autoPlay
                    onEnded={() => setPlaying(null)}
                    onError={() => setPlaying(null)}
                    className="hidden"
                  >
                    <track kind="captions" />
                  </audio>
                )}
              </div>
            </div>
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
