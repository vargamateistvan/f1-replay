import { useMemo } from "react";
import type { Lap } from "@/api/types";
import type { KeyMoment } from "@/components/KeyMoments/types";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";

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
  lead_change: { badge: "LEAD", badgeBg: "#2a2a35", badgeText: "#fff" },
  fastest_lap: { badge: "FASTEST", badgeBg: "#9b59f5", badgeText: "#fff" },
  safety_car: { badge: "SC", badgeBg: "#f5a623", badgeText: "#000" },
  vsc: { badge: "VSC", badgeBg: "#f5a623", badgeText: "#000" },
  red_flag: { badge: "RED", badgeBg: "#e8002d", badgeText: "#fff" },
};

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

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
    const groups: MomentGroup[] = [];

    for (const moment of visibleMoments) {
      let lapNumber: number | null;
      if (isQualifying) {
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
    <div className="panel-scroll">
      {momentGroups.map((group, groupIndex) => (
        <div
          key={`${group.lapNumber ?? "session"}-${groupIndex}`}
          className="mb-0.5"
        >
          <div className="sticky top-0 z-10 border-b border-[#2a2a35] bg-[#1a1a24] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted select-none">
            {(() => {
              const isQualifying = sessionType
                ?.toLowerCase()
                .includes("qualifying");
              return isQualifying && group.lapNumber !== null
                ? `Q${group.lapNumber}`
                : group.lapNumber !== null
                  ? `Lap ${group.lapNumber}`
                  : "Session";
            })()}
          </div>
          {group.moments.map((m, i) => {
            const cfg = KIND_CONFIG[m.kind];
            return (
              <button
                key={`${m.kind}-${m.ms}-${i}`}
                onClick={() => onJump(m.ms)}
                className="w-full flex items-center gap-3 border-b border-[#2a2a35] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="text-[10px] font-mono tabular-nums text-muted w-10 shrink-0">
                  {fmtMs(m.ms)}
                </span>
                <span
                  className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 shrink-0"
                  style={{ background: cfg.badgeBg, color: cfg.badgeText }}
                >
                  {cfg.badge}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className="text-[11px] font-bold block truncate"
                    style={{
                      color:
                        m.kind === "lead_change"
                          ? m.color
                          : "rgba(255,255,255,0.9)",
                    }}
                  >
                    {m.label}
                  </span>
                  {m.sublabel && (
                    <span
                      className="text-[10px] font-mono tabular-nums block"
                      style={{ color: m.color }}
                    >
                      {m.sublabel}
                    </span>
                  )}
                </span>
                <span className="text-muted text-[10px] shrink-0">›</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
