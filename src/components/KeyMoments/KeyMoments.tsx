import { useMemo } from "react";
import type { Lap } from "@/api/types";
import type { KeyMoment } from "@/components/KeyMoments/types";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { isPracticeSession } from "@/utils/session";
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
  moments: KeyMoment[];
  laps?: Lap[];
  sessionType?: string;
  sessionStartMs?: number;
  sessionTimeMs: number;
  showAllItems?: boolean;
  onJump: (ms: number) => void;
  phaseLookup?: (ms: number) => number | null;
}

type MomentGroup = {
  lapNumber: number | null;
  moments: KeyMoment[];
};

const KIND_CONFIG: Record<
  KeyMoment["kind"],
  { badge: string; badgeBg: string; badgeText: string }
> = {
  lead_change: {
    badge: "LEAD",
    badgeBg: "rgb(var(--color-panel) / 1)",
    badgeText: "#fff",
  },
  fastest_lap: { badge: "FASTEST", badgeBg: "#9b59f5", badgeText: "#fff" },
  safety_car: { badge: "SC", badgeBg: "#f5a623", badgeText: "#000" },
  vsc: { badge: "VSC", badgeBg: "#f5a623", badgeText: "#000" },
  red_flag: { badge: "RED", badgeBg: "#e8002d", badgeText: "#fff" },
};

export function KeyMoments({
  moments,
  laps = [],
  sessionType,
  sessionStartMs = 0,
  sessionTimeMs,
  showAllItems = false,
  onJump,
  phaseLookup = () => null,
}: Readonly<Props>) {
  const visibleMoments = useMemo(
    () =>
      showAllItems
        ? moments
        : moments.filter((moment) => moment.ms <= sessionTimeMs),
    [moments, sessionTimeMs, showAllItems],
  );

  const lapLookup = useMemo(
    () => buildLapLookup(laps, sessionStartMs),
    [laps, sessionStartMs],
  );

  const momentGroups = useMemo<MomentGroup[]>(() => {
    const isQualifying = sessionType?.toLowerCase().includes("qualifying");
    const isPractice = sessionType ? isPracticeSession(sessionType) : false;
    const groups: MomentGroup[] = [];

    for (const moment of visibleMoments) {
      let lapNumber: number | null;
      if (isPractice) {
        lapNumber = null;
      } else if (isQualifying) {
        lapNumber = phaseLookup(moment.ms);
      } else {
        lapNumber = lapNumberAtMs(lapLookup, moment.ms);
      }

      const current = groups.at(-1);
      if (current?.lapNumber !== lapNumber) {
        groups.push({ lapNumber, moments: [moment] });
      } else {
        current.moments.push(moment);
      }
    }
    return groups
      .map((group) => ({
        lapNumber: group.lapNumber,
        moments: [...group.moments].reverse(),
      }))
      .reverse();
  }, [visibleMoments, lapLookup, sessionType, phaseLookup]);

  if (visibleMoments.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        No key moments yet — scrub forward or select a session
      </div>
    );
  }

  return (
    <div className={COMMENTARY_FEED_SCROLL_CLASS}>
      {momentGroups.map((group, groupIndex) => (
        <div
          key={`${group.lapNumber ?? "session"}-${groupIndex}`}
          className={COMMENTARY_GROUP_CLASS}
        >
          <div className={COMMENTARY_GROUP_HEADER_CLASS}>
            {commentaryGroupLabel(sessionType, group.lapNumber)}
          </div>
          <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
            {group.moments.map((m, i) => {
            const cfg = KIND_CONFIG[m.kind];
            return (
              <button
                key={`${m.kind}-${m.ms}-${i}`}
                onClick={() => onJump(m.ms)}
                className={`w-full ${COMMENTARY_ROW_CLASS}`}
                style={{ borderLeft: `6px solid ${cfg.badgeBg}` }}
              >
                <span className={COMMENTARY_TIME_CLASS}>
                  {formatSessionElapsedTime(m.ms)}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={`${COMMENTARY_TITLE_CLASS} block`}
                    style={{
                      color:
                        m.kind === "lead_change"
                          ? m.color
                          : "rgba(255,255,255,0.9)",
                    }}
                  >
                    {m.label}
                  </span>
                  <span className={COMMENTARY_META_CLASS}>
                    <span
                      className={COMMENTARY_BADGE_CLASS}
                      style={{
                        backgroundColor: cfg.badgeBg,
                        color: cfg.badgeText,
                      }}
                    >
                      {cfg.badge}
                    </span>
                    {m.sublabel && (
                      <span
                        className="font-mono tabular-nums"
                        style={{ color: m.color }}
                      >
                        {m.sublabel}
                      </span>
                    )}
                  </span>
                </span>
                <span className={COMMENTARY_CHEVRON_CLASS}>›</span>
              </button>
            );
          })}
          </div>
        </div>
      ))}
    </div>
  );
}
