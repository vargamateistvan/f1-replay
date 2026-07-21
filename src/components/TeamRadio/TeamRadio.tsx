import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import type { TeamRadio as TeamRadioEntry, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";
import { toSafeExternalUrl } from "@/utils/url";

interface Props {
  readonly entries: TeamRadioEntry[];
  readonly sessionKey?: number | null;
  readonly sessionYear?: number | null;
  readonly drivers: Driver[];
  readonly laps?: Lap[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly showAllItems?: boolean;
}

type VisibleRadioEntry = {
  entry: TeamRadioEntry;
  dateMs: number;
  lapNumber: number | null;
};

type LapGroup = {
  lapNumber: number | null;
  entries: VisibleRadioEntry[];
};

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
  showAllItems = false,
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
    if (showAllItems) return [...datedEntries].reverse();
    const endIndex = upperBoundByValue(datedEntries, currentT, (e) => e.dateMs);
    return endIndex > 0 ? datedEntries.slice(0, endIndex).reverse() : [];
  }, [datedEntries, currentT, showAllItems]);

  const visible = useMemo<VisibleRadioEntry[]>(
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
    const groups: LapGroup[] = [];
    for (const item of visible) {
      const current = groups.at(-1);
      if (current?.lapNumber !== item.lapNumber) {
        groups.push({ lapNumber: item.lapNumber, entries: [item] });
      } else {
        current.entries.push(item);
      }
    }
    return groups;
  }, [visible]);

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
    <div className="panel-scroll px-2 pb-2 space-y-1">
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
      {lapGroups.map((group) => (
        <div key={group.lapNumber ?? "session"} className="mb-0.5">
          <div className="sticky top-0 z-10 border-b border-[#2a2a35] bg-[#1a1a24] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none">
            {group.lapNumber !== null ? `Lap ${group.lapNumber}` : "Session"}
          </div>
          {group.entries.map(({ entry: e, dateMs: entryMs, lapNumber }) => {
            const driver = driverByNumber.get(e.driver_number);
            const color = teamColor(driver?.team_colour);
            const recordingUrl = toSafeExternalUrl(e.recording_url);
            const hasAudio = Boolean(recordingUrl);
            const isPlaying = recordingUrl !== null && playing === recordingUrl;
            return (
              <div
                key={`${e.driver_number}-${e.date}-${e.recording_url}`}
                className="flex items-center gap-3 border-b border-[#2a2a35] px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
              >
                <span className="w-10 shrink-0 text-[10px] font-mono tabular-nums text-muted">
                  {fmtSessionTime(entryMs, sessionStartMs)}
                </span>
                <span
                  className="shrink-0 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest"
                  style={{ background: color, color: "#fff" }}
                >
                  Radio
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate text-[11px] font-bold"
                    style={{ color }}
                  >
                    {driver?.name_acronym ?? e.driver_number}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                    {lapNumber !== null && <span>Lap {lapNumber}</span>}
                    <span className="font-mono tabular-nums text-white/80">
                      Team radio
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <button
                    onClick={() => recordingUrl && play(recordingUrl)}
                    disabled={!hasAudio}
                    aria-label={isPlaying ? "Stop" : "Play"}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                      isPlaying
                        ? "bg-f1red text-white"
                        : "bg-panel text-muted hover:text-white hover:bg-[#38383f]"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Square
                          size={11}
                          strokeWidth={2.4}
                          aria-hidden="true"
                        />{" "}
                        Stop
                      </>
                    ) : (
                      <>
                        <Play size={11} strokeWidth={2.4} aria-hidden="true" />{" "}
                        Play
                      </>
                    )}
                  </button>
                  {isPlaying && recordingUrl && (
                    <audio
                      key={recordingUrl}
                      src={recordingUrl}
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
