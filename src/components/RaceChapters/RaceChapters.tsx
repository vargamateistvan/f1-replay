import { useMemo, useState } from "react";
import type { Driver, Lap } from "@/api/types";
import type {
  RaceChapter,
  WhatChangedSnapshot,
  ChapterKind,
} from "@/timeline/raceControl";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60 > 0 ? `${s % 60}s` : ""}`.trim();
}

// ─── Chapter badge config ─────────────────────────────────────────────────────

const CHAPTER_CONFIG: Record<
  ChapterKind,
  { badge: string; bg: string; text: string; trackCls: string }
> = {
  start: {
    badge: "START",
    bg: "rgb(var(--color-track) / 1)",
    text: "#9ca3af",
    trackCls: "border-l-[#636369]",
  },
  green: {
    badge: "GREEN",
    bg: "#14532d22",
    text: "#86efac",
    trackCls: "border-l-green-600",
  },
  safety_car: {
    badge: "SC",
    bg: "#78350f22",
    text: "#fcd34d",
    trackCls: "border-l-amber-400",
  },
  vsc: {
    badge: "VSC",
    bg: "#78350f15",
    text: "#fbbf24",
    trackCls: "border-l-amber-500",
  },
  red_flag: {
    badge: "RED",
    bg: "#7f1d1d22",
    text: "#fca5a5",
    trackCls: "border-l-red-500",
  },
  finish: {
    badge: "FINISH",
    bg: "rgb(var(--color-track) / 1)",
    text: "#9ca3af",
    trackCls: "border-l-[#636369]",
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
    snapshot.pitsDuringWindow.length === 0
  ) {
    return null;
  }

  return (
    <div className="mx-2 mb-2 rounded border border-panel bg-track text-[10px]">
      <div className="px-2 py-1 border-b border-panel text-[9px] font-black uppercase tracking-widest text-muted">
        What Changed
      </div>

      <div className="divide-y divide-panel">
        {/* Gainers */}
        {gainers.map((c) => {
          const d = driverMap.get(c.driverNumber);
          return (
            <div
              key={c.driverNumber}
              className="flex items-center gap-2 px-2 py-1"
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
              className="flex items-center gap-2 px-2 py-1"
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
                  className="rounded px-1 py-0.5 text-[9px] font-black uppercase"
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
  snapshot: WhatChangedSnapshot | null;
  drivers: Driver[];
  onJump: (ms: number) => void;
  onPlayWindow?: (startMs: number, endMs: number) => void;
}

function ChapterRow({
  chapter,
  isCurrent,
  snapshot,
  drivers,
  onJump,
  onPlayWindow,
}: ChapterRowProps) {
  const cfg = CHAPTER_CONFIG[chapter.kind];
  const canReplayWindow = onPlayWindow && chapter.endMs !== null;

  return (
    <div
      className={`border-b border-[#2a2a35] ${isCurrent ? "bg-white/[0.04]" : ""}`}
    >
      <div
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] border-l-2 ${cfg.trackCls}`}
        style={{ background: isCurrent ? undefined : cfg.bg }}
      >
        {/* Time */}
        <span className="text-[10px] font-mono tabular-nums text-muted w-10 shrink-0">
          {fmtMs(chapter.startMs)}
        </span>

        {/* Badge */}
        <span
          className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 shrink-0 rounded-sm"
          style={{
            background: cfg.bg,
            color: cfg.text,
            border: `1px solid ${cfg.text}33`,
          }}
        >
          {cfg.badge}
        </span>

        {/* Label */}
        <span className="flex-1 min-w-0">
          <span className="text-[11px] font-bold block truncate text-white/90">
            {chapter.label}
          </span>
          {chapter.durationMs !== null && (
            <span className="text-[9px] text-muted block">
              {fmtDuration(chapter.durationMs)}
            </span>
          )}
        </span>

        {/* Current indicator */}
        {isCurrent && (
          <span className="shrink-0 text-[8px] font-black uppercase tracking-widest text-f1red">
            NOW
          </span>
        )}

        {/* Jump / replay actions */}
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onJump(chapter.startMs)}
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest bg-panel text-muted hover:text-white hover:bg-[#38383f]"
            aria-label={`Jump to ${chapter.label}`}
            title={`Jump to ${chapter.label}`}
          >
            Jump
          </button>
          {canReplayWindow && (
            <button
              type="button"
              onClick={() => onPlayWindow(chapter.startMs, chapter.endMs!)}
              className="h-6 px-2 text-[9px] font-black uppercase tracking-widest bg-f1red text-white hover:bg-red-600"
              aria-label={`Replay ${chapter.label}`}
              title={`Replay ${chapter.label}`}
            >
              Replay
            </button>
          )}
        </div>
      </div>

      {/* What Changed inline card — only for completed incident windows */}
      {snapshot !== null && (
        <WhatChangedCard snapshot={snapshot} drivers={drivers} />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  chapters: RaceChapter[];
  snapshots: WhatChangedSnapshot[];
  drivers: Driver[];
  laps?: Lap[];
  sessionStartMs?: number;
  sessionTimeMs: number;
  showAllItems?: boolean;
  onJump: (ms: number) => void;
  onPlayWindow?: (startMs: number, endMs: number) => void;
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
  sessionStartMs = 0,
  sessionTimeMs,
  showAllItems = false,
  onJump,
  onPlayWindow,
}: Props) {
  const [incidentOnly, setIncidentOnly] = useState(false);
  const lapLookup = useMemo(
    () => buildLapLookup(laps, sessionStartMs),
    [laps, sessionStartMs],
  );

  const visibleChapters = useMemo(
    () =>
      incidentOnly
        ? chapters.filter(
            (c) =>
              c.incidentWindowId !== null &&
              (showAllItems || c.startMs <= sessionTimeMs),
          )
        : chapters.filter((c) => showAllItems || c.startMs <= sessionTimeMs),
    [chapters, incidentOnly, showAllItems, sessionTimeMs],
  );

  const chapterGroups = useMemo<ChapterGroup[]>(() => {
    const groups: ChapterGroup[] = [];
    for (const chapter of visibleChapters) {
      const lapNumber = lapNumberAtMs(lapLookup, chapter.startMs);
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
  }, [visibleChapters, lapLookup]);

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
    <div className="panel-scroll">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 border-b border-[#2a2a35] bg-track">
        <button
          type="button"
          onClick={() => setIncidentOnly((v) => !v)}
          aria-pressed={incidentOnly}
          className={`h-6 px-2 text-[9px] font-black uppercase tracking-widest transition-colors ${
            incidentOnly
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "bg-panel text-muted hover:text-white"
          }`}
        >
          Incident Only
        </button>
        <span className="text-[9px] text-muted uppercase tracking-widest">
          {visibleChapters.length} chapters
        </span>
      </div>
      <div>
        {chapterGroups.map((group, groupIndex) => (
          <div
            key={`${group.lapNumber ?? "session"}-${groupIndex}`}
            className="mb-0.5"
          >
            <div className="sticky top-9 z-10 border-b border-[#2a2a35] bg-[#1a1a24] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none">
              {group.lapNumber !== null ? `Lap ${group.lapNumber}` : "Session"}
            </div>
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
                  snapshot={snapshot}
                  drivers={drivers}
                  onJump={onJump}
                  onPlayWindow={onPlayWindow}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
