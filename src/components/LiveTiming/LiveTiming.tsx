import { useMemo } from "react";
import type {
  Driver,
  Position,
  Interval,
  Pit,
  Lap,
  RaceControl,
  StartingGrid,
  Stint,
  CarData,
} from "@/api/types";
import { teamColor } from "@/utils/color";
import { laneDuration, pitStopTime } from "@/utils/pit";
import { deriveRetiredDrivers } from "@/utils/retirement";
import { SECTOR_GREEN_S } from "@/constants";
import { SectorBar, type SectorTier } from "./SectorBar";
import { TyreBadge } from "./TyreBadge";
import { DriverHeadshot } from "@/components/DriverHeadshot";

interface Props {
  readonly drivers: Driver[];
  readonly positions: Position[];
  readonly intervals: Interval[];
  readonly pits: Pit[];
  readonly laps: Lap[];
  readonly raceControl?: RaceControl[];
  readonly stints?: Stint[];
  readonly grid?: StartingGrid[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly sessionName?: string;
  readonly totalLapCount?: number | null;
  /** Latest car-data sample per driver at the playhead. When provided, the tower
   *  renders live telemetry columns (speed/gear/rpm/throttle/brake/DRS). */
  readonly carData?: ReadonlyMap<number, CarData>;
  readonly isLoading?: boolean;
  readonly selectedDriver?: number | null;
  readonly compareDriver?: number | null;
  readonly onSelectDriver?: (driverNumber: number) => void;
}

interface SessionBestOwner {
  driverNumber: number;
  lapNumber: number;
  time: number;
}

function fmtGap(val: number | string | null) {
  if (val === null) return "—";
  if (typeof val === "string") return val;
  if (val === 0) return "LEAD";
  return `+${val.toFixed(3)}`;
}

function fmtTime(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

function sectorTier(
  t: number | null,
  best: number | null,
  personalBest: number | null,
): SectorTier {
  if (t === null) return "none";
  if (best !== null && t <= best + 0.001) return "fastest";
  if (personalBest !== null && t <= personalBest + 0.001) return "personal";
  if (best !== null && t - best <= SECTOR_GREEN_S) return "fast";
  if (t !== null) return "normal";
  return "none";
}

function lapTimeTier(
  lapTime: number | null,
  sessionBest: number | null,
): "fastest" | "fast" | "normal" | "none" {
  if (lapTime === null || sessionBest === null) return "none";
  if (lapTime <= sessionBest + 0.001) return "fastest";
  if (lapTime - sessionBest <= SECTOR_GREEN_S) return "fast";
  return "normal";
}

const LAP_TIME_COLOUR: Record<string, string> = {
  fastest: "text-[#9b59f5]",
  fast: "text-[#39b54a]",
  normal: "text-white",
  none: "text-muted",
};

const TH =
  "py-1.5 px-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#636369] select-none sm:px-2";

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="block h-1.5 bg-panel overflow-hidden rounded-sm">
      <span
        className="block h-full"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
        }}
      />
    </span>
  );
}

function isRaceSession(sessionName?: string) {
  if (!sessionName) return false;
  const n = sessionName.toLowerCase();
  return n.includes("race") || n.includes("sprint");
}

export function LiveTiming({
  drivers,
  positions,
  intervals,
  pits,
  laps,
  raceControl = [],
  stints,
  grid,
  sessionName,
  carData,
  sessionTimeMs,
  sessionStartMs,
  isLoading,
  totalLapCount = null,
  selectedDriver,
  compareDriver,
  onSelectDriver,
}: Props) {
  const showTelemetry = carData !== undefined;
  const currentT = sessionStartMs + sessionTimeMs;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  const posMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of positions)
      if (new Date(p.date).getTime() <= currentT)
        m.set(p.driver_number, p.position);
    return m;
  }, [positions, currentT]);

  const gridMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of grid ?? []) m.set(g.driver_number, g.position);
    return m;
  }, [grid]);

  const intMap = useMemo(() => {
    const m = new Map<number, Interval>();
    for (const i of intervals)
      if (new Date(i.date).getTime() <= currentT) m.set(i.driver_number, i);
    return m;
  }, [intervals, currentT]);

  const pittingNow = useMemo(() => {
    const s = new Set<number>();
    for (const p of pits) {
      const entry = new Date(p.date).getTime();
      const lane = laneDuration(p);
      const exitMs = lane ? entry + lane * 1000 : entry + 30_000;
      if (entry <= currentT && currentT <= exitMs) s.add(p.driver_number);
    }
    return s;
  }, [pits, currentT]);

  const completedLaps = useMemo(
    () =>
      laps.filter(
        (lap): lap is Lap & { date_start: string; lap_duration: number } => {
          if (!lap.date_start || lap.lap_duration === null) return false;
          const lapEndT =
            new Date(lap.date_start).getTime() + lap.lap_duration * 1000;
          return lapEndT <= currentT;
        },
      ),
    [laps, currentT],
  );

  const lastLapMap = useMemo(() => {
    const m = new Map<number, Lap>();
    for (const l of completedLaps) {
      const prev = m.get(l.driver_number);
      if (!prev || l.lap_number > prev.lap_number) m.set(l.driver_number, l);
    }
    return m;
  }, [completedLaps]);

  const currentLapMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of laps) {
      if (!l.date_start) continue;
      if (new Date(l.date_start).getTime() <= currentT) {
        const prev = m.get(l.driver_number) ?? 0;
        if (l.lap_number > prev) m.set(l.driver_number, l.lap_number);
      }
    }
    return m;
  }, [laps, currentT]);

  // Session-best sector times and lap times
  const sessionBest = useMemo(() => {
    let s1: number | null = null,
      s2: number | null = null,
      s3: number | null = null;
    let lap: number | null = null;
    for (const l of completedLaps) {
      if (
        l.duration_sector_1 !== null &&
        (s1 === null || l.duration_sector_1 < s1)
      )
        s1 = l.duration_sector_1;
      if (
        l.duration_sector_2 !== null &&
        (s2 === null || l.duration_sector_2 < s2)
      )
        s2 = l.duration_sector_2;
      if (
        l.duration_sector_3 !== null &&
        (s3 === null || l.duration_sector_3 < s3)
      )
        s3 = l.duration_sector_3;
      if (l.lap_duration !== null && (lap === null || l.lap_duration < lap))
        lap = l.lap_duration;
    }
    return { s1, s2, s3, lap };
  }, [completedLaps]);

  const sessionBestOwners = useMemo(() => {
    let s1: SessionBestOwner | null = null;
    let s2: SessionBestOwner | null = null;
    let s3: SessionBestOwner | null = null;
    for (const lap of completedLaps) {
      if (
        lap.duration_sector_1 !== null &&
        (s1 === null || lap.duration_sector_1 < s1.time)
      ) {
        s1 = {
          driverNumber: lap.driver_number,
          lapNumber: lap.lap_number,
          time: lap.duration_sector_1,
        };
      }
      if (
        lap.duration_sector_2 !== null &&
        (s2 === null || lap.duration_sector_2 < s2.time)
      ) {
        s2 = {
          driverNumber: lap.driver_number,
          lapNumber: lap.lap_number,
          time: lap.duration_sector_2,
        };
      }
      if (
        lap.duration_sector_3 !== null &&
        (s3 === null || lap.duration_sector_3 < s3.time)
      ) {
        s3 = {
          driverNumber: lap.driver_number,
          lapNumber: lap.lap_number,
          time: lap.duration_sector_3,
        };
      }
    }
    return { s1, s2, s3 };
  }, [completedLaps]);

  // Pit stops per driver up to the playhead: count + most recent stop time (s).
  const pitInfoMap = useMemo(() => {
    const m = new Map<number, { count: number; lastStop: number | null }>();
    for (const p of pits) {
      if (new Date(p.date).getTime() > currentT) continue;
      const prev = m.get(p.driver_number) ?? { count: 0, lastStop: null };
      m.set(p.driver_number, {
        count: prev.count + 1,
        lastStop: pitStopTime(p) ?? prev.lastStop,
      });
    }
    return m;
  }, [pits, currentT]);

  // Starting tyre: compound from the driver's first stint (stint_number === 1,
  // per the OpenF1 stints schema). Falls back to the lowest lap_start if a
  // session lacks a stint_number 1 record.
  const startCompoundMap = useMemo(() => {
    const first = new Map<number, { rank: number; compound: string }>();
    for (const s of stints ?? []) {
      const rank = s.stint_number === 1 ? -1 : s.lap_start;
      const prev = first.get(s.driver_number);
      if (!prev || rank < prev.rank)
        first.set(s.driver_number, { rank, compound: s.compound });
    }
    return new Map([...first.entries()].map(([n, v]) => [n, v.compound]));
  }, [stints]);

  // Personal-best sectors per driver (across all laps up to currentT)
  const personalBestMap = useMemo(() => {
    const m = new Map<
      number,
      { s1: number | null; s2: number | null; s3: number | null }
    >();
    for (const l of completedLaps) {
      const pb = m.get(l.driver_number) ?? { s1: null, s2: null, s3: null };
      if (
        l.duration_sector_1 !== null &&
        (pb.s1 === null || l.duration_sector_1 < pb.s1)
      )
        pb.s1 = l.duration_sector_1;
      if (
        l.duration_sector_2 !== null &&
        (pb.s2 === null || l.duration_sector_2 < pb.s2)
      )
        pb.s2 = l.duration_sector_2;
      if (
        l.duration_sector_3 !== null &&
        (pb.s3 === null || l.duration_sector_3 < pb.s3)
      )
        pb.s3 = l.duration_sector_3;
      m.set(l.driver_number, pb);
    }
    return m;
  }, [completedLaps]);

  const retiredDrivers = useMemo(() => {
    return deriveRetiredDrivers({
      positions,
      laps,
      raceControl,
      currentT,
      isRaceSession: isRaceSession(sessionName),
    });
  }, [positions, laps, raceControl, currentT, sessionName]);

  const sorted = useMemo(
    () => [...posMap.entries()].sort((a, b) => a[1] - b[1]),
    [posMap],
  );

  const hasSectorReference = Boolean(
    sessionBestOwners.s1 || sessionBestOwners.s2 || sessionBestOwners.s3,
  );

  if (isLoading) {
    return (
      <div className="p-3 sm:p-4">
        <div className="rounded-sm border border-panel bg-surface px-3 py-3 sm:px-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-f1red animate-pulse">
            Loading timing data
          </div>
          <div className="mt-1 text-xs text-muted">
            Pulling positions, gaps, and sector references.
          </div>
        </div>
      </div>
    );
  }
  if (sorted.length === 0) {
    return (
      <div className="p-3 sm:p-4">
        <div className="rounded-sm border border-panel bg-surface px-3 py-3 sm:px-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white">
            {sessionStartMs ? "Waiting for timing" : "No session selected"}
          </div>
          <div className="mt-1 text-xs text-muted">
            {sessionStartMs
              ? "Scrub forward or wait for the first classified samples."
              : "Choose an event and session to populate the timing tower."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      <div className="border-b border-[#2a2a35] bg-surface/80 px-2 py-2 sm:px-3">
        {hasSectorReference ? (
          <>
            <div className="mb-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Tap driver A, then driver B to compare
            </div>
            <div className="grid grid-cols-1 gap-1.5 min-[360px]:grid-cols-3 sm:gap-2">
              {(
                [
                  ["S1", sessionBestOwners.s1],
                  ["S2", sessionBestOwners.s2],
                  ["S3", sessionBestOwners.s3],
                ] as const
              ).map(([label, best]) => {
                const driver = best
                  ? driverByNumber.get(best.driverNumber)
                  : undefined;
                const color = teamColor(driver?.team_colour);
                return (
                  <div
                    key={label}
                    className="flex min-w-0 items-center gap-1.5 border border-panel bg-track px-1.5 py-1 sm:gap-2 sm:px-2"
                    title={
                      best
                        ? `${label} ${best.time.toFixed(3)} · ${driver?.full_name ?? best.driverNumber} · Lap ${best.lapNumber}`
                        : `${label} not set yet`
                    }
                  >
                    <span className="bg-[#9b59f5] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                      {label}
                    </span>
                    {best ? (
                      <>
                        <span
                          className="min-w-0 truncate font-black text-[10px] uppercase tracking-[0.08em] sm:text-[11px] sm:tracking-[0.1em]"
                          style={{ color }}
                        >
                          {driver?.name_acronym ?? best.driverNumber}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-white sm:text-[10px]">
                          {best.time.toFixed(3)}
                        </span>
                      </>
                    ) : (
                      <span className="truncate text-[9px] uppercase tracking-[0.1em] text-muted sm:text-[10px] sm:tracking-[0.12em]">
                        Waiting
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-sm border border-panel bg-track px-2 py-2">
            <span className="bg-[#9b59f5] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shrink-0">
              Sectors
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white">
                First timed lap pending
              </div>
              <div className="text-[10px] text-muted">
                Tap driver A, then driver B to compare once sector references
                are live.
              </div>
            </div>
          </div>
        )}
      </div>
      <table className="w-full border-collapse table-fixed sm:table-auto">
        <thead>
          <tr className="sticky top-0 bg-track z-10 border-b border-[#38383f]">
            <th className={`${TH} text-left w-8`}>P</th>
            <th
              className={`${TH} text-left w-[6.75rem] min-[390px]:w-[7.5rem] sm:w-auto`}
            >
              Driver
            </th>
            <th className={`${TH} text-right`}>Best Lap</th>
            <th className={`${TH} text-right`}>Gap</th>
            <th className={`${TH} hidden sm:table-cell text-center`}>S1</th>
            <th className={`${TH} hidden sm:table-cell text-center`}>S2</th>
            <th className={`${TH} hidden sm:table-cell text-center`}>S3</th>
            <th className={`${TH} text-left w-[3.5rem] min-[390px]:w-auto`}>
              Tyre
            </th>
            <th className={`${TH} text-center w-7 sm:w-8`}>Pit</th>
            <th className={`${TH} hidden sm:table-cell text-center w-16`}>
              Lap
            </th>
            {showTelemetry && (
              <>
                <th className={`${TH} hidden lg:table-cell text-right`}>
                  Speed
                </th>
                <th className={`${TH} hidden lg:table-cell text-center w-8`}>
                  Gear
                </th>
                <th className={`${TH} hidden xl:table-cell text-right`}>RPM</th>
                <th className={`${TH} hidden lg:table-cell text-center`}>
                  Thr/Brk
                </th>
                <th className={`${TH} hidden lg:table-cell text-center w-10`}>
                  DRS
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map(([num, pos], idx) => {
            const driver = driverByNumber.get(num);
            const intData = intMap.get(num);
            const color = teamColor(driver?.team_colour);
            const inPit = pittingNow.has(num);
            const lastLap = lastLapMap.get(num) ?? null;
            const currentLap = currentLapMap.get(num) ?? null;
            const pitInfo = pitInfoMap.get(num) ?? null;
            const car = carData?.get(num) ?? null;
            const speedDisplay = car
              ? String(Math.round(car.speed)).padStart(3, "0")
              : "---";
            const rpmDisplay = car
              ? String(Math.round(car.rpm)).padStart(5, "0")
              : "-----";
            const gearDisplay = car
              ? String(car.n_gear === 0 ? "N" : car.n_gear)
              : "-";
            const drsDisplay = car ? (car.drs >= 10 ? "ON" : "OFF") : "--";
            const throttleDisplay = car
              ? `${String(Math.round(car.throttle)).padStart(3, "0")}%`
              : "---%";
            const brakeDisplay = car
              ? `${String(Math.round(car.brake)).padStart(3, "0")}%`
              : "---%";
            const pb = personalBestMap.get(num) ?? {
              s1: null,
              s2: null,
              s3: null,
            };

            const t1 = sectorTier(
              lastLap?.duration_sector_1 ?? null,
              sessionBest.s1,
              pb.s1,
            );
            const t2 = sectorTier(
              lastLap?.duration_sector_2 ?? null,
              sessionBest.s2,
              pb.s2,
            );
            const t3 = sectorTier(
              lastLap?.duration_sector_3 ?? null,
              sessionBest.s3,
              pb.s3,
            );
            const lapTier = lapTimeTier(
              lastLap?.lap_duration ?? null,
              sessionBest.lap,
            );

            const gridPos = gridMap.get(num) ?? null;
            const gained = gridPos !== null ? gridPos - pos : null;
            const retired = retiredDrivers.has(num);
            const selected = selectedDriver === num;
            const compared = compareDriver === num;
            const rowBg = selected
              ? "bg-[#2a2a35]"
              : compared
                ? "bg-[#1a2438]"
                : retired
                  ? "opacity-50"
                  : idx % 2 === 1
                    ? "bg-white/[0.02] hover:bg-white/[0.06]"
                    : "hover:bg-white/[0.06]";

            return (
              <tr
                key={num}
                onClick={() => onSelectDriver?.(num)}
                className={`border-b border-[#1e1e28] transition-colors ${onSelectDriver ? "cursor-pointer" : ""} ${rowBg}`}
              >
                {/* Position */}
                <td className="py-3 px-1.5 font-black text-sm tabular-nums text-white/90 sm:px-2">
                  {pos}
                </td>

                {/* Driver */}
                <td className="py-3 px-1 sm:px-2">
                  <div>
                    <span className="flex items-center gap-1 sm:gap-2">
                      <DriverHeadshot driver={driver} accent={color} size="xs" />
                      {/* Team colour bar */}
                      <span
                        className="w-[2px] h-4 shrink-0 rounded-sm"
                        style={{ background: color }}
                      />
                      {/* Surname in CAPS */}
                      <span className="min-w-0 truncate font-bold text-[10px] min-[390px]:text-[11px] tracking-[0.03em] min-[390px]:tracking-[0.05em] uppercase text-white">
                        {driver?.name_acronym ?? num}
                      </span>
                      {selected && (
                        <span className="bg-f1red text-white text-[8px] min-[390px]:text-[9px] font-black uppercase tracking-widest px-1 min-[390px]:px-1.5 py-0.5">
                          A
                        </span>
                      )}
                      {compared && (
                        <span className="bg-[#1e40af] text-white text-[8px] min-[390px]:text-[9px] font-black uppercase tracking-widest px-1 min-[390px]:px-1.5 py-0.5">
                          B
                        </span>
                      )}
                      {/* Places gained/lost */}
                      {gained !== null && gained !== 0 && (
                        <span
                          className={`hidden min-[390px]:inline text-[9px] font-bold tabular-nums ${gained > 0 ? "text-[#39b54a]" : "text-[#ff5252]"}`}
                          title={`${gained > 0 ? "Gained" : "Lost"} ${Math.abs(gained)} since start (P${gridPos})`}
                        >
                          {gained > 0 ? "▲" : "▼"}
                          {Math.abs(gained)}
                        </span>
                      )}
                      {retired && (
                        <span className="hidden min-[390px]:inline-block bg-[#3a1010] text-[#ff5252] text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5">
                          RET
                        </span>
                      )}
                      {!retired && inPit && (
                        <span className="hidden min-[390px]:inline-block bg-panel text-muted text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5">
                          PIT
                        </span>
                      )}
                    </span>

                    {showTelemetry && (
                      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] leading-4 font-mono tabular-nums sm:hidden">
                        <span className="inline-flex min-w-0 items-center gap-1 text-[#7dd3fc]">
                          <span className="text-[#89a6bf]">SPD</span>
                          <span className="w-[3ch] text-right">{speedDisplay}</span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 text-[#c4b5fd]">
                          <span className="text-[#a79ac9]">RPM</span>
                          <span className="w-[5ch] text-right">{rpmDisplay}</span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 text-[#fde68a]">
                          <span className="text-[#d2bf72]">G</span>
                          <span className="w-[3ch] text-right">{gearDisplay}</span>
                        </span>
                        <span
                          className={`inline-flex min-w-0 items-center gap-1 ${car && car.drs >= 10 ? "text-[#39d743]" : "text-[#9ca3af]"}`}
                        >
                          <span className="text-[#9ba1a8]">DRS</span>
                          <span className="w-[3ch] text-right">{drsDisplay}</span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 text-[#4ade80]">
                          <span className="text-[#6eb989]">T</span>
                          <span className="w-[4ch] text-right">{throttleDisplay}</span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 text-[#f87171]">
                          <span className="text-[#c88787]">B</span>
                          <span className="w-[4ch] text-right">{brakeDisplay}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Best lap time */}
                <td
                  className={`py-3 px-1 text-right font-mono text-[11px] min-[390px]:text-[12px] tabular-nums sm:px-2 ${LAP_TIME_COLOUR[lapTier]}`}
                >
                  {fmtTime(lastLap?.lap_duration ?? null)}
                </td>

                {/* Gap to leader */}
                <td className="py-3 px-1 text-right font-mono text-[10px] min-[390px]:text-[11px] tabular-nums text-muted sm:px-2">
                  {fmtGap(intData?.gap_to_leader ?? null)}
                </td>

                {/* Sector bars */}
                <td className="hidden sm:table-cell py-3 px-1">
                  <div className="flex justify-center">
                    <SectorBar
                      tier={t1}
                      title={`S1: ${lastLap?.duration_sector_1?.toFixed(3) ?? "—"}`}
                    />
                  </div>
                </td>
                <td className="hidden sm:table-cell py-3 px-1">
                  <div className="flex justify-center">
                    <SectorBar
                      tier={t2}
                      title={`S2: ${lastLap?.duration_sector_2?.toFixed(3) ?? "—"}`}
                    />
                  </div>
                </td>
                <td className="hidden sm:table-cell py-3 px-1">
                  <div className="flex justify-center">
                    <SectorBar
                      tier={t3}
                      title={`S3: ${lastLap?.duration_sector_3?.toFixed(3) ?? "—"}`}
                    />
                  </div>
                </td>

                {/* Tyre: starting compound → current compound + age */}
                <td className="py-3 px-1.5 sm:px-2">
                  <TyreBadge
                    stints={stints ?? []}
                    driverNumber={num}
                    currentLap={currentLap}
                    startCompound={startCompoundMap.get(num) ?? null}
                  />
                </td>

                {/* Pit stop count (hover: most recent stop time) */}
                <td
                  className="py-3 px-1 text-center font-mono text-[10px] tabular-nums text-muted sm:px-2 sm:text-[11px]"
                  title={
                    pitInfo && pitInfo.lastStop !== null
                      ? `${pitInfo.count} stop${pitInfo.count !== 1 ? "s" : ""} · last ${pitInfo.lastStop.toFixed(1)}s`
                      : undefined
                  }
                >
                  {pitInfo ? pitInfo.count : "—"}
                </td>

                {/* Current lap */}
                <td className="hidden sm:table-cell py-3 px-2 text-center font-mono text-[11px] tabular-nums text-muted">
                  {currentLap !== null && totalLapCount !== null
                    ? `${currentLap}/${totalLapCount}`
                    : (currentLap ?? "—")}
                </td>

                {/* Live car telemetry */}
                {showTelemetry && (
                  <>
                    {/* Speed */}
                    <td className="hidden lg:table-cell py-3 px-2 text-right font-mono text-[12px] tabular-nums text-white">
                      {car ? Math.round(car.speed) : "—"}
                    </td>
                    {/* Gear */}
                    <td className="hidden lg:table-cell py-3 px-2 text-center font-mono text-[12px] tabular-nums text-white/90">
                      {car ? (car.n_gear === 0 ? "N" : car.n_gear) : "—"}
                    </td>
                    {/* RPM */}
                    <td className="hidden xl:table-cell py-3 px-2 text-right font-mono text-[11px] tabular-nums text-muted">
                      {car ? Math.round(car.rpm) : "—"}
                    </td>
                    {/* Throttle / brake mini bars */}
                    <td className="hidden lg:table-cell py-3 px-2">
                      {car ? (
                        <span className="flex flex-col gap-0.5 w-16 mx-auto">
                          <MiniBar value={car.throttle} color="#39d743" />
                          <MiniBar value={car.brake} color="#ff5252" />
                        </span>
                      ) : (
                        <span className="block text-center text-muted">—</span>
                      )}
                    </td>
                    {/* DRS */}
                    <td className="hidden lg:table-cell py-3 px-2 text-center">
                      {car ? (
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                            car.drs >= 10
                              ? "bg-[#39d743] text-black"
                              : "bg-panel text-[#636369]"
                          }`}
                          title={`DRS raw value ${car.drs}`}
                        >
                          DRS
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
