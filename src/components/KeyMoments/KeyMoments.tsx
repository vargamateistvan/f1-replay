import { useMemo } from "react";
import type { Lap } from "@/api/types";
import type { KeyMoment } from "@/components/KeyMoments/types";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { isPracticeSession } from "@/utils/session";
import {
  COMMENTARY_EMPTY_CLASS,
  COMMENTARY_FEED_SCROLL_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  commentaryGroupLabel,
} from "@/components/CommentaryPanels/commentaryList";
import { CommentaryRow } from "@/components/CommentaryPanels/CommentaryRow";
import { TOKEN_HEX } from "@/designTokens";

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
  fastest_lap: { badge: "FASTEST", badgeBg: TOKEN_HEX.purple, badgeText: "#fff" },
  safety_car: { badge: "SC", badgeBg: TOKEN_HEX.orange, badgeText: "#000" },
  vsc: { badge: "VSC", badgeBg: TOKEN_HEX.orange, badgeText: "#000" },
  red_flag: { badge: "RED", badgeBg: TOKEN_HEX.f1red, badgeText: "#fff" },
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
      <div className={COMMENTARY_EMPTY_CLASS}>
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
                <CommentaryRow
                  key={`${m.kind}-${m.ms}-${i}`}
                  ms={m.ms}
                  rowClickable
                  onJump={onJump}
                  badge={{
                    label: cfg.badge,
                    style: { backgroundColor: cfg.badgeBg, color: cfg.badgeText },
                  }}
                  accent={cfg.badgeBg}
                  upcoming={m.ms > sessionTimeMs}
                  title={
                    <span
                      style={
                        m.kind === "lead_change" ? { color: m.color } : undefined
                      }
                    >
                      {m.label}
                    </span>
                  }
                  meta={
                    m.sublabel ? (
                      <span style={{ color: m.color }}>{m.sublabel}</span>
                    ) : undefined
                  }
                />
              );
          })}
          </div>
        </div>
      ))}
    </div>
  );
}
