import { useMemo, useState } from "react";
import type { Driver, Lap } from "@/api/types";
import type {
  RaceChapter,
  WhatChangedSnapshot,
  ChapterKind,
} from "@/timeline/raceControl";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  COMMENTARY_PRIMARY_BUTTON_CLASS,
  COMMENTARY_TOOLBAR_CLASS,
  commentaryGroupLabel,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryRow } from "@/components/CommentaryPanels/CommentaryRow";
import { Chip } from "@/components/SettingsModal/SettingsPrimitives";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60 > 0 ? `${s % 60}s` : ""}`.trim();
}

// ─── Chapter badge config ─────────────────────────────────────────────────────

const CHAPTER_CONFIG: Record<
  ChapterKind,
  { badge: string; bg: string; text: string }
> = {
  start: {
    badge: "START",
    bg: "#e8e8e8",
    text: "#000",
  },
  green: {
    badge: "GREEN",
    bg: "#39b54a",
    text: "#fff",
  },
  safety_car: {
    badge: "SC",
    bg: "#f5a623",
    text: "#000",
  },
  vsc: {
    badge: "VSC",
    bg: "#f5a623",
    text: "#000",
  },
  yellow: {
    badge: "YELLOW",
    bg: "#f5d400",
    text: "#000",
  },
  red_flag: {
    badge: "RED",
    bg: "#e8002d",
    text: "#fff",
  },
  finish: {
    badge: "FINISH",
    bg: "#e8e8e8",
    text: "#000",
  },
};

// ─── What Changed inline card ─────────────────────────────────────────────────

interface WhatChangedCardProps {
  snapshot: WhatChangedSnapshot;
  drivers: Driver[];
}

function WhatChangedCard({ snapshot, drivers }: WhatChangedCardProps) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));

  const gainers = snapshot.positionChanges
    .filter((c) => c.delta > 0)
    .slice(0, 4);
  const losers = snapshot.positionChanges
    .filter((c) => c.delta < 0)
    .reverse()
    .slice(0, 4);

  if (
    gainers.length === 0 &&
    losers.length === 0 &&
    snapshot.pitsDuringWindow.length === 0 &&
    snapshot.retiredDuringWindow.length === 0
  ) {
    return null;
  }

  return (
    <div className="mt-2 border border-panel bg-track text-[10px]">
      <div className="border-b border-panel px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
        What Changed
      </div>

      <div className="divide-y divide-panel">
        {/* Gainers */}
        {gainers.map((c) => {
          const d = driverMap.get(c.driverNumber);
          return (
            <div
              key={c.driverNumber}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <span className="text-green-400 font-black w-5 text-center shrink-0">
                ▲{c.delta}
              </span>
              <span
                className="font-black uppercase w-7 shrink-0"
                style={{ color: `#${d?.team_colour ?? "ffffff"}` }}
              >
                {d?.name_acronym ?? `#${c.driverNumber}`}
              </span>
              {c.before !== null && c.after !== null && (
                <span className="text-muted">
                  P{c.before} → P{c.after}
                </span>
              )}
            </div>
          );
        })}

        {/* Losers */}
        {losers.map((c) => {
          const d = driverMap.get(c.driverNumber);
          return (
            <div
              key={c.driverNumber}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <span className="text-red-400 font-black w-5 text-center shrink-0">
                ▼{Math.abs(c.delta)}
              </span>
              <span
                className="font-black uppercase w-7 shrink-0"
                style={{ color: `#${d?.team_colour ?? "ffffff"}` }}
              >
                {d?.name_acronym ?? `#${c.driverNumber}`}
              </span>
              {c.before !== null && c.after !== null && (
                <span className="text-muted">
                  P{c.before} → P{c.after}
                </span>
              )}
            </div>
          );
        })}

        {/* Pits */}
        {snapshot.pitsDuringWindow.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-2 py-1">
            <span className="text-muted text-[9px] font-black uppercase tracking-widest shrink-0">
              Pitted:
            </span>
            {snapshot.pitsDuringWindow.map((dn) => {
              const d = driverMap.get(dn);
              return (
                <span
                  key={dn}
                  className="px-1 py-0.5 text-[9px] font-black uppercase"
                  style={{
                    background: `#${d?.team_colour ?? "636369"}22`,
                    color: `#${d?.team_colour ?? "ffffff"}`,
                  }}
                >
                  {d?.name_acronym ?? `#${dn}`}
                </span>
              );
            })}
          </div>
        )}

        {/* Retirements */}
        {snapshot.retiredDuringWindow.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-2 py-1">
            <span className="text-muted text-[9px] font-black uppercase tracking-widest shrink-0">
              Retired:
            </span>
            {snapshot.retiredDuringWindow.map((dn) => {
              const d = driverMap.get(dn);
              return (
                <span
                  key={dn}
                  className="px-1 py-0.5 text-[9px] font-black uppercase"
                  style={{
                    background: `#${d?.team_colour ?? "636369"}22`,
                    color: `#${d?.team_colour ?? "ffffff"}`,
                  }}
                >
                  {d?.name_acronym ?? `#${dn}`}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chapter row ──────────────────────────────────────────────────────────────

interface ChapterRowProps {
  chapter: RaceChapter;
  isCurrent: boolean;
  upcoming: boolean;
  snapshot: WhatChangedSnapshot | null;
  drivers: Driver[];
  onJump: (ms: number) => void;
  onPlayWindow?: (startMs: number, endMs: number) => void;
}

function ChapterRow({
  chapter,
  isCurrent,
  upcoming,
  snapshot,
  drivers,
  onJump,
  onPlayWindow,
}: ChapterRowProps) {
  const cfg = CHAPTER_CONFIG[chapter.kind];
  const canReplayWindow = onPlayWindow && chapter.endMs !== null;

  return (
    <CommentaryRow
      ms={chapter.startMs}
      badge={{ label: cfg.badge, style: { background: cfg.bg, color: cfg.text } }}
      accent={cfg.bg}
      active={isCurrent}
      upcoming={upcoming}
      title={chapter.label}
      meta={
        chapter.durationMs !== null || isCurrent ? (
          <>
            {chapter.durationMs !== null && (
              <span>{fmtDuration(chapter.durationMs)}</span>
            )}
            {isCurrent && (
              <span className="font-sans font-black uppercase tracking-widest text-f1red">
                NOW
              </span>
            )}
          </>
        ) : undefined
      }
      jumpLabel={chapter.label}
      onJump={onJump}
      actions={
        canReplayWindow ? (
          <button
            type="button"
            onClick={() => onPlayWindow(chapter.startMs, chapter.endMs!)}
            className={COMMENTARY_PRIMARY_BUTTON_CLASS}
            aria-label={`Replay ${chapter.label}`}
            title={`Replay ${chapter.label}`}
          >
            Replay
          </button>
        ) : undefined
      }
    >
      {/* What Changed inline card — only for completed incident windows */}
      {snapshot !== null && (
        <WhatChangedCard snapshot={snapshot} drivers={drivers} />
      )}
    </CommentaryRow>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  chapters: RaceChapter[];
  snapshots: WhatChangedSnapshot[];
  drivers: Driver[];
  laps?: Lap[];
  sessionType?: string;
  sessionStartMs?: number;
  sessionTimeMs: number;
  showAllItems?: boolean;
  onJump: (ms: number) => void;
  onPlayWindow?: (startMs: number, endMs: number) => void;
  phaseLookup?: (ms: number) => number | null;
}

type ChapterGroup = {
  lapNumber: number | null;
  chapters: RaceChapter[];
};

export function RaceChapters({
  chapters,
  snapshots,
  drivers,
  laps = [],
  sessionType,
  sessionStartMs = 0,
  sessionTimeMs,
  showAllItems = false,
  onJump,
  onPlayWindow,
  phaseLookup = () => null,
}: Props) {
  const [incidentOnly, setIncidentOnly] = useState(false);
  const lapLookup = useMemo(
    () => buildLapLookup(laps, sessionStartMs),
    [laps, sessionStartMs],
  );

  const visibleChapters = useMemo(() => {
    const timeScoped = showAllItems
      ? chapters
      : chapters.filter((chapter) => chapter.startMs <= sessionTimeMs);

    return incidentOnly
      ? timeScoped.filter((chapter) => chapter.incidentWindowId !== null)
      : timeScoped;
  }, [chapters, incidentOnly, sessionTimeMs, showAllItems]);

  const chapterGroups = useMemo<ChapterGroup[]>(() => {
    const isQualifying = sessionType?.toLowerCase().includes("qualifying");
    const isPractice = sessionType ? isPracticeSession(sessionType) : false;
    const groups: ChapterGroup[] = [];

    for (const chapter of visibleChapters) {
      let lapNumber: number | null;
      if (isPractice) {
        // Practice chapters should live under a single session group.
        lapNumber = null;
      } else if (isQualifying) {
        lapNumber = phaseLookup(chapter.startMs);
      } else {
        lapNumber = lapNumberAtMs(lapLookup, chapter.startMs);
      }

      const current = groups.at(-1);
      if (current?.lapNumber !== lapNumber) {
        groups.push({ lapNumber, chapters: [chapter] });
      } else {
        current.chapters.push(chapter);
      }
    }
    return groups
      .map((group) => ({
        lapNumber: group.lapNumber,
        chapters: [...group.chapters].reverse(),
      }))
      .reverse();
  }, [visibleChapters, lapLookup, sessionType, phaseLookup]);

  if (chapters.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        No session loaded — select a race session to see chapters
      </div>
    );
  }

  // Map incidentWindowId → snapshot for O(1) lookup
  const snapshotByWindowId = new Map(snapshots.map((s) => [s.window.id, s]));

  // The current chapter is the last one whose startMs ≤ sessionTimeMs
  let currentChapterId: string | null = null;
  for (const ch of visibleChapters) {
    if (ch.startMs <= sessionTimeMs) currentChapterId = ch.id;
  }

  return (
    <div className={COMMENTARY_FEED_SCROLL_CLASS}>
      <div className={`sticky top-0 z-20 ${COMMENTARY_TOOLBAR_CLASS}`}>
        <Chip
          label="Incident Only"
          color="#f5a623"
          active={incidentOnly}
          onToggle={() => setIncidentOnly((v) => !v)}
        />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          {visibleChapters.length} chapters
        </span>
      </div>
      <div className="space-y-2">
        {chapterGroups.map((group, groupIndex) => (
          <div
            key={`${group.lapNumber ?? "session"}-${groupIndex}`}
            className={COMMENTARY_GROUP_CLASS}
          >
            <div className={COMMENTARY_GROUP_HEADER_CLASS}>
              {commentaryGroupLabel(sessionType, group.lapNumber)}
            </div>
            <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
              {group.chapters.map((ch) => {
                const snapshot =
                  ch.incidentWindowId !== null
                    ? (snapshotByWindowId.get(ch.incidentWindowId) ?? null)
                    : null;
                return (
                  <ChapterRow
                    key={ch.id}
                    chapter={ch}
                    isCurrent={ch.id === currentChapterId}
                    upcoming={ch.startMs > sessionTimeMs}
                    snapshot={snapshot}
                    drivers={drivers}
                    onJump={onJump}
                    onPlayWindow={onPlayWindow}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
