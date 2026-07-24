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
  readonly sessionType?: string;
  readonly drivers: Driver[];
  readonly laps?: Lap[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly showAllItems?: boolean;
  readonly phaseLookup?: (ms: number) => number | null;
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
  sessionType,
  drivers,
  laps = [],
  sessionTimeMs,
  sessionStartMs,
  showAllItems = false,
  phaseLookup = () => null,
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
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-panel text-muted hover:text-white hover:bg-track"
            aria-label="Export team radio CSV"
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
            {group.entries.map(({ entry: e, dateMs: entryMs, lapNumber }) => {
              const driver = driverByNumber.get(e.driver_number);
              const color = teamColor(driver?.team_colour);
              const recordingUrl = toSafeExternalUrl(e.recording_url);
              const hasAudio = Boolean(recordingUrl);
              const isPlaying =
                recordingUrl !== null && playing === recordingUrl;
              return (
                <div
                  key={`${e.driver_number}-${e.date}-${e.recording_url}`}
                  className="mb-0.5 flex items-start gap-3 border-b border-panel px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
                  style={{ borderLeft: `2px solid ${color}` }}
                >
                  <span className="w-10 shrink-0 text-[10px] font-mono tabular-nums text-muted">
                    {fmtSessionTime(entryMs, sessionStartMs)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[11px] font-bold text-white/90">
                      Team radio for{" "}
                      <span style={{ color }}>
                        {driver?.name_acronym ?? e.driver_number}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                      <span className="inline-flex h-5 w-fit max-w-full shrink-0 items-center justify-center rounded px-1.5 whitespace-nowrap text-center text-[8px] font-black uppercase tracking-widest leading-none bg-track text-white/80">
                        Radio
                      </span>
                      {lapNumber !== null && <span>Lap {lapNumber}</span>}
                      <span className="font-mono tabular-nums text-white/70">
                        clip
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => recordingUrl && play(recordingUrl)}
                      disabled={!hasAudio}
                      aria-label={isPlaying ? "Stop" : "Play"}
                      className={`flex h-6 items-center gap-1.5 rounded px-2 text-[9px] font-black uppercase tracking-widest transition-colors ${
                        isPlaying
                          ? "bg-f1red text-white"
                          : "bg-panel text-muted hover:text-white hover:bg-track"
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
                          <Play
                            size={11}
                            strokeWidth={2.4}
                            aria-hidden="true"
                          />{" "}
                          Play
                        </>
                      )}
                    </button>
                    <span className="shrink-0 text-[10px] text-muted">›</span>
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
