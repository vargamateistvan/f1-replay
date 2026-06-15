import type { CatchupSummary as CatchupSummaryData } from "@/hooks/useCatchupSummary";
import type { Driver } from "@/api/types";
import type { OvertakePayload, FastestLapPayload } from "@/timeline/events";
import { teamColor } from "@/utils/color";

interface Props {
  summary: CatchupSummaryData;
  drivers: Driver[];
  onDismiss: () => void;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m} min`;
}

function fmtLapTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

export function CatchupSummary({ summary, drivers, onDismiss }: Props) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const duration = summary.toMs - summary.fromMs;

  // Group events by kind for the headline counts
  const counts: Record<string, number> = {};
  for (const ev of summary.events) {
    counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
  }

  // Build a readable headline from counts (skip 'radio' — not interesting in bulk)
  const headlineParts: string[] = [];
  if (counts.pit)
    headlineParts.push(`${counts.pit} pit stop${counts.pit > 1 ? "s" : ""}`);
  if (counts.flag)
    headlineParts.push(`${counts.flag} flag${counts.flag > 1 ? "s" : ""}`);
  if (counts.penalty)
    headlineParts.push(
      `${counts.penalty} ${counts.penalty > 1 ? "penalties" : "penalty"}`,
    );
  if (counts.overtake)
    headlineParts.push(
      `${counts.overtake} overtake${counts.overtake > 1 ? "s" : ""}`,
    );
  if (counts.fastest_lap)
    headlineParts.push(
      `${counts.fastest_lap} fastest lap${counts.fastest_lap > 1 ? "s" : ""}`,
    );

  // Pull out the single most notable events for the detail list
  const notable = summary.events
    .filter(
      (e) =>
        e.kind === "fastest_lap" ||
        e.kind === "flag" ||
        e.kind === "penalty" ||
        e.kind === "overtake",
    )
    .slice(0, 5);

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[min(340px,90vw)]">
      <div className="bg-[#1f1f27] border border-[#38383f] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#15151e] border-b border-[#38383f]">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
            ⏭ While you were away
          </span>
          <span className="text-[10px] font-mono text-muted ml-1">
            ({fmtDuration(duration)})
          </span>
          <button
            onClick={onDismiss}
            className="ml-auto text-muted hover:text-white text-xs"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Headline counts */}
        {headlineParts.length > 0 && (
          <div className="px-3 py-2 border-b border-[#2a2a35]">
            <p className="text-[11px] text-white/80">
              {headlineParts.join(" · ")}
            </p>
          </div>
        )}

        {/* Notable events */}
        {notable.length > 0 && (
          <div className="divide-y divide-[#2a2a35]">
            {notable.map((ev) => {
              if (ev.kind === "fastest_lap") {
                const p = ev.payload as FastestLapPayload;
                const d = driverMap.get(p.driverNumber);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="text-[8px] font-black px-1 py-0.5 bg-[#9b59f5] text-white uppercase tracking-widest shrink-0">
                      FASTEST
                    </span>
                    <span
                      className="text-[11px] font-bold flex-1"
                      style={{ color: "#9b59f5" }}
                    >
                      {d?.name_acronym ?? p.driverNumber}
                    </span>
                    <span
                      className="text-[10px] font-mono tabular-nums"
                      style={{ color: "#9b59f5" }}
                    >
                      {fmtLapTime(p.lapTime)}
                    </span>
                  </div>
                );
              }
              if (ev.kind === "flag") {
                const p = ev.payload as {
                  flag: string;
                  message: string;
                  lapNumber: number | null;
                };
                const FLAG_COLORS: Record<string, string> = {
                  RED: "#e8002d",
                  SAFETY_CAR: "#f5a623",
                  VIRTUAL_SC: "#f5a623",
                  YELLOW: "#f5d400",
                  DOUBLE_YELLOW: "#f5d400",
                };
                const color = FLAG_COLORS[p.flag] ?? "#636369";
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span
                      className="w-[3px] self-stretch shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-[11px] text-white/80 flex-1 truncate">
                      {p.message}
                    </span>
                  </div>
                );
              }
              if (ev.kind === "penalty") {
                const p = ev.payload as { message: string };
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="text-[8px] font-black px-1 py-0.5 bg-[#e8002d] text-white uppercase tracking-widest shrink-0">
                      PENALTY
                    </span>
                    <span className="text-[11px] text-white/80 flex-1 truncate">
                      {p.message}
                    </span>
                  </div>
                );
              }
              if (ev.kind === "overtake") {
                const p = ev.payload as OvertakePayload;
                const overtaking = driverMap.get(p.overtaking);
                const overtaken = driverMap.get(p.overtaken);
                const color = teamColor(overtaking?.team_colour);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="text-[11px] font-bold" style={{ color }}>
                      {overtaking?.name_acronym ?? p.overtaking}
                    </span>
                    <span className="text-muted text-[9px]">▸</span>
                    <span className="text-[11px] text-white/60">
                      {overtaken?.name_acronym ?? p.overtaken}
                    </span>
                    {p.position && (
                      <span className="text-[9px] text-muted ml-auto">
                        P{p.position}
                      </span>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-muted hover:text-white border-t border-[#2a2a35] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
