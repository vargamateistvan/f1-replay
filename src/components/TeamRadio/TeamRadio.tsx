import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import type { TeamRadio as TeamRadioEntry, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { useAudioProgress } from "@/hooks/useAudioProgress";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";
import { isPracticeSession } from "@/utils/session";
import { toSafeExternalUrl } from "@/utils/url";
import { RadioAudio } from "@/components/RadioAudio";
import {
  COMMENTARY_BUTTON_CLASS,
  COMMENTARY_EMPTY_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  commentaryGroupLabel,
} from "@/components/CommentaryPanels/commentaryList";
import {
  CommentaryDriver,
  CommentaryRow,
} from "@/components/CommentaryPanels/CommentaryRow";

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
  readonly onJump?: (ms: number) => void;
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
  onJump,
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
    return <div className={COMMENTARY_EMPTY_CLASS}>{emptyMessage}</div>;
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
            className={COMMENTARY_BUTTON_CLASS}
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
            {group.entries.map(({ entry: e, dateMs: entryMs }) => (
              <RadioRow
                key={`${e.driver_number}-${e.date}-${e.recording_url}`}
                entry={e}
                entryMs={entryMs}
                sessionStartMs={sessionStartMs}
                sessionTimeMs={sessionTimeMs}
                driver={driverByNumber.get(e.driver_number)}
                playing={playing}
                onPlay={play}
                onEnded={() => setPlaying(null)}
                onJump={onJump}
              />
            ))}
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

function RadioRow({
  entry: e,
  entryMs,
  sessionStartMs,
  sessionTimeMs,
  driver,
  playing,
  onPlay,
  onEnded,
  onJump,
}: {
  entry: TeamRadioEntry;
  entryMs: number;
  sessionStartMs: number;
  sessionTimeMs: number;
  driver: Driver | undefined;
  playing: string | null;
  onPlay: (url: string) => void;
  onEnded: () => void;
  onJump?: (ms: number) => void;
}) {
  const recordingUrl = toSafeExternalUrl(e.recording_url);
  const hasAudio = Boolean(recordingUrl);
  const isPlaying = recordingUrl !== null && playing === recordingUrl;
  const { progress, audioRef, onTimeUpdate } = useAudioProgress(isPlaying);
  const ms = entryMs - sessionStartMs;

  return (
    <CommentaryRow
      ms={ms}
      badge={{ label: "Radio", className: "bg-[#4da6ff] text-black" }}
      accent={teamColor(driver?.team_colour)}
      upcoming={ms > sessionTimeMs}
      title={
        <CommentaryDriver
          driver={driver}
          driverNumber={e.driver_number}
          showName
        />
      }
      meta={hasAudio ? undefined : <span>No audio</span>}
      jumpLabel={`team radio for ${driver?.name_acronym ?? e.driver_number}`}
      onJump={onJump}
      actions={
        <>
          <button
            type="button"
            onClick={() => recordingUrl && onPlay(recordingUrl)}
            disabled={!hasAudio}
            aria-label={isPlaying ? "Stop" : "Play"}
            className={`${COMMENTARY_BUTTON_CLASS} relative w-[64px] overflow-hidden ${
              isPlaying ? "border-f1red text-white" : ""
            }`}
          >
            {isPlaying && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-f1red transition-[width] duration-150 ease-linear"
                style={{ width: `${progress * 100}%` }}
                data-progress={Math.round(progress * 100)}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {isPlaying ? (
                <>
                  <Square size={11} strokeWidth={2.4} aria-hidden="true" /> Stop
                </>
              ) : (
                <>
                  <Play size={11} strokeWidth={2.4} aria-hidden="true" /> Play
                </>
              )}
            </span>
          </button>
          {isPlaying && recordingUrl && (
            <RadioAudio
              key={recordingUrl}
              audioRef={audioRef}
              src={recordingUrl}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onError={onEnded}
            />
          )}
        </>
      }
    />
  );
}
