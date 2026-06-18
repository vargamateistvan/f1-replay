import { useMemo } from "react";
import type { Driver, Position } from "@/api/types";
import type { QualiPhase } from "@/utils/session";
import { teamColor } from "@/utils/color";

interface Props {
  readonly phase: QualiPhase | null;
  readonly drivers: Driver[];
  readonly positions: Position[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly countdownMs?: number | null;
}

interface BannerDriver {
  driverNumber: number;
  position: number;
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function bannerMeta(phase: QualiPhase): {
  title: string;
  subtitle: string;
  range: [number, number];
} {
  if (phase === "Q1") {
    return {
      title: "Q1 Knockout Zone",
      subtitle: "Bottom five at risk",
      range: [16, 20],
    };
  }
  if (phase === "Q2") {
    return {
      title: "Q1 Eliminated",
      subtitle: "Five drivers out",
      range: [16, 20],
    };
  }
  return {
    title: "Q2 Eliminated",
    subtitle: "Five drivers out",
    range: [11, 15],
  };
}

export function QualifyingBanner({
  phase,
  drivers,
  positions,
  sessionTimeMs,
  sessionStartMs,
  countdownMs = null,
}: Props) {
  const currentT = sessionStartMs + sessionTimeMs;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.driver_number, driver])),
    [drivers],
  );

  const bannerDrivers = useMemo<BannerDriver[]>(() => {
    if (!phase) return [];
    const latest = new Map<number, number>();
    for (const position of positions) {
      const ms = new Date(position.date).getTime();
      if (ms > currentT) continue;
      latest.set(position.driver_number, position.position);
    }
    const [minPos, maxPos] = bannerMeta(phase).range;
    return [...latest.entries()]
      .map(([driverNumber, position]) => ({ driverNumber, position }))
      .filter((entry) => entry.position >= minPos && entry.position <= maxPos)
      .sort((a, b) => a.position - b.position);
  }, [phase, positions, currentT]);

  if (!phase) return null;

  const meta = bannerMeta(phase);

  return (
    <div className="border-b border-panel bg-[linear-gradient(90deg,#120f17_0%,#1a1520_45%,#10131d_100%)] px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded bg-f1red px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">
            {phase}
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
              {meta.title}
            </div>
            <div className="text-[11px] text-white/60">{meta.subtitle}</div>
          </div>
        </div>
        {countdownMs !== null && countdownMs > 0 && (
          <div className="rounded border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-xs tabular-nums text-white">
            {fmtCountdown(countdownMs)}
          </div>
        )}
      </div>

      {bannerDrivers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {bannerDrivers.map((entry) => {
            const driver = driverByNumber.get(entry.driverNumber);
            const color = teamColor(driver?.team_colour);
            return (
              <span
                key={entry.driverNumber}
                className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-2.5 py-1.5"
              >
                <span className="font-mono text-[11px] tabular-nums text-white/55">
                  P{entry.position}
                </span>
                <span
                  className="h-3.5 w-[3px] rounded-sm"
                  style={{ background: color }}
                />
                <span
                  className="text-[11px] font-black uppercase tracking-[0.12em]"
                  style={{ color }}
                >
                  {driver?.name_acronym ?? entry.driverNumber}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
