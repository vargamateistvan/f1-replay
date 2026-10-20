import { useEffect, useMemo, useState } from "react";
import { Play, Radio, Square } from "lucide-react";
import type { TeamRadio as TeamRadioEntry, Driver, Lap } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { COMMENTARY_FRESH_MS } from "@/constants";
import { useSettings } from "@/stores/settings";
import { useAudioProgress } from "@/hooks/useAudioProgress";
import { teamColor } from "@/utils/color";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { upperBoundByValue } from "@/utils/sortedTime";
import { isPracticeSession } from "@/utils/session";
import { toSafeExternalUrl } from "@/utils/url";
import { RadioAudio } from "@/components/RadioAudio";
import {
  COMMENTARY_BADGE_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_META_CLASS,
  COMMENTARY_ROW_CLASS,
  COMMENTARY_TIME_CLASS,
  COMMENTARY_FRESH_ROW_CLASS,
  COMMENTARY_TITLE_CLASS,
  commentaryGroupLabel,
  formatSessionElapsedTime,
  isFreshCommentaryItem,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryJumpButton } from "@/components/CommentaryPanels/CommentaryJumpButton";
import {
  CommentaryGroupHeader,
  CommentarySummary,
  DriverChip,
  FreshTag,
  type CommentaryStat,
} from "@/components/CommentaryPanels/CommentaryBits";

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

  const summaryStats = useMemo((): CommentaryStat[] => {
    const byDriver = new Map<number, number>();
    for (const { entry } of visibleAll) {
      byDriver.set(entry.driver_number, (byDriver.get(entry.driver_number) ?? 0) + 1);
    }
    const stats: CommentaryStat[] = [
      { key: "clips", label: "Clips", value: visibleAll.length },
      { key: "drivers", label: "Drivers heard", value: byDriver.size },
    ];
    let top: [number, number] | null = null;
    for (const pair of byDriver) {
      if (!top || pair[1] > top[1]) top = pair;
    }
    if (top && top[1] >= 2) {
      stats.push({
        key: "top",
        label: "Most heard",
        value: `×${top[1]}`,
        accent: "#4da6ff",
        detail: (
          <DriverChip driver={driverByNumber.get(top[0])} driverNumber={top[0]} />
        ),
      });
    }
    return stats;
  }, [visibleAll, driverByNumber]);

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
      <CommentarySummary stats={summaryStats} />
      {lapGroups.map((group, groupIndex) => (
        <div
          key={`${group.lapNumber ?? "session"}-${groupIndex}`}
          className={COMMENTARY_GROUP_CLASS}
        >
          <CommentaryGroupHeader
            label={commentaryGroupLabel(sessionType, group.lapNumber)}
            count={group.entries.length}
          />
          <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
            {group.entries.map(({ entry: e, dateMs: entryMs }) => (
              <RadioRow
                key={`${e.driver_number}-${e.date}-${e.recording_url}`}
                entry={e}
                entryMs={entryMs}
                sessionStartMs={sessionStartMs}
                driver={driverByNumber.get(e.driver_number)}
                isFresh={isFreshCommentaryItem(
                  sessionTimeMs - (entryMs - sessionStartMs),
                  showAllItems,
                  COMMENTARY_FRESH_MS,
                )}
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
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-panel text-muted hover:text-white hover:bg-track"
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
  driver,
  isFresh,
  playing,
  onPlay,
  onEnded,
  onJump,
}: {
  entry: TeamRadioEntry;
  entryMs: number;
  sessionStartMs: number;
  driver: Driver | undefined;
  isFresh: boolean;
  playing: string | null;
  onPlay: (url: string) => void;
  onEnded: () => void;
  onJump?: (ms: number) => void;
}) {
  const color = teamColor(driver?.team_colour);
  const recordingUrl = toSafeExternalUrl(e.recording_url);
  const hasAudio = Boolean(recordingUrl);
  const isPlaying = recordingUrl !== null && playing === recordingUrl;
  const { progress, audioRef, onTimeUpdate } = useAudioProgress(isPlaying);

  return (
    <div
      className={`${COMMENTARY_ROW_CLASS} ${
        isPlaying ? "!bg-f1red/10" : ""
      } ${isFresh ? COMMENTARY_FRESH_ROW_CLASS : ""}`}
      style={{ borderLeft: `6px solid ${color}` }}
    >
      <span className={COMMENTARY_TIME_CLASS}>
        {fmtSessionTime(entryMs, sessionStartMs)}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`${COMMENTARY_TITLE_CLASS} flex items-center gap-1.5`}>
          <span className="text-white/55">Team radio</span>
          <DriverChip driver={driver} driverNumber={e.driver_number} />
          {isPlaying && <OnAirBars />}
        </div>
        <div className={COMMENTARY_META_CLASS}>
          <span
            className={`${COMMENTARY_BADGE_CLASS} gap-1 bg-[#4da6ff] text-black`}
          >
            <Radio size={10} strokeWidth={3} className="shrink-0" aria-hidden="true" />
            Radio
          </span>
          {isPlaying && (
            <span className="text-[8px] font-black uppercase tracking-widest text-f1red">
              On air
            </span>
          )}
          {isFresh && <FreshTag />}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <button
          onClick={() => recordingUrl && onPlay(recordingUrl)}
          disabled={!hasAudio}
          aria-label={isPlaying ? "Stop" : "Play"}
          className={`relative flex h-6 w-[64px] items-center justify-center gap-1.5 overflow-hidden rounded px-2 text-[9px] font-black uppercase tracking-widest transition-colors ${
            isPlaying
              ? "bg-track text-white"
              : "bg-panel text-muted hover:text-white hover:bg-track"
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
        {onJump && (
          <CommentaryJumpButton
            ms={entryMs - sessionStartMs}
            label={`team radio for ${driver?.name_acronym ?? e.driver_number}`}
            onJump={onJump}
          />
        )}
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
      </div>
    </div>
  );
}

/** Little bouncing level meter shown while a clip plays. */
function OnAirBars() {
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
      {[0, 150, 300, 450].map((delay) => (
        <span
          key={delay}
          className="w-[2px] origin-bottom rounded-full bg-f1red motion-safe:animate-radio-bar"
          style={{ height: "100%", animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
