import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import type { TeamRadio as TeamRadioEntry, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";
import { isPracticeSession } from "@/utils/session";
import { toSafeExternalUrl } from "@/utils/url";
import {
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_CHEVRON_CLASS,
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
  return formatSessionElapsedTime(Math.max(0, entryDateMs - sessionStartMs));
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
    <div className={COMMENTARY_FEED_SCROLL_CLASS}>
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
      {lapGroups.map((group, groupIndex) => (
        <div
          key={`${group.lapNumber ?? "session"}-${groupIndex}`}
          className={COMMENTARY_GROUP_CLASS}
        >
          <div className={COMMENTARY_GROUP_HEADER_CLASS}>
            {commentaryGroupLabel(sessionType, group.lapNumber)}
          </div>
          <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
            {group.entries.map(({ entry: e, dateMs: entryMs }) => {
              const driver = driverByNumber.get(e.driver_number);
              const color = teamColor(driver?.team_colour);
              const recordingUrl = toSafeExternalUrl(e.recording_url);
              const hasAudio = Boolean(recordingUrl);
              const isPlaying =
                recordingUrl !== null && playing === recordingUrl;
              return (
                <div
                  key={`${e.driver_number}-${e.date}-${e.recording_url}`}
                  className={COMMENTARY_ROW_CLASS}
                  style={{ borderLeft: `6px solid ${color}` }}
                >
                  <span className={COMMENTARY_TIME_CLASS}>
                    {fmtSessionTime(entryMs, sessionStartMs)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={COMMENTARY_TITLE_CLASS}>
                      Team radio for{" "}
                      <span style={{ color }}>
                        {driver?.name_acronym ?? e.driver_number}
                      </span>
                    </div>
                    <div className={COMMENTARY_META_CLASS}>
                      <span
                        className={`${COMMENTARY_BADGE_CLASS} bg-[#4da6ff] text-black`}
                      >
                        Radio
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
                    <span className={COMMENTARY_CHEVRON_CLASS}>›</span>
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
