import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { laneDuration } from "@/utils/pit";
import { deriveRetiredDrivers } from "@/utils/retirement";
import { SECTOR_GREEN_S } from "@/constants";
import { useSettings } from "@/stores/settings";
import {
  toDisplaySpeed,
  speedUnitLabel,
  speedUnitCompactLabel,
} from "@/utils/units";
import {
  detectQualiPhase,
  isQualiSession,
  isTimedSession,
  type QualiPhase,
} from "@/utils/session";
import { normalizeRaceControl } from "@/timeline/raceControl";
import { SectorBar, type SectorTier } from "./SectorBar";
import { TyreBadge } from "./TyreBadge";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { TooltipCard } from "@/components/TooltipCard/TooltipCard";

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
  readonly showMinisectors?: boolean;
  readonly compactDriverColumn?: boolean;
  readonly wideSectors?: boolean;
  readonly dense?: boolean;
  readonly showDenseMobileTelemetry?: boolean;
  readonly showIntervalColumn?: boolean;
  readonly showFullLastName?: boolean;
  readonly showMobileAlertsColumn?: boolean;
  readonly showMobileBestLapColumn?: boolean;
  readonly showMobileGapColumn?: boolean;
  readonly showMobilePosDeltaColumn?: boolean;
  readonly showMobileTyreColumn?: boolean;
  readonly showMobilePitCountColumn?: boolean;
  readonly showMobileIntervalColumn?: boolean;
  readonly showMobileSectorsColumns?: boolean;
  readonly columnVisibility?: Partial<TimingColumnVisibility>;
  readonly isLoading?: boolean;
  readonly selectedDriver?: number | null;
  readonly compareDriver?: number | null;
  readonly onSelectDriver?: (driverNumber: number) => void;
  readonly fullWidthTable?: boolean;
  /** Race finish time (in ms relative to session start) — used to mark post-race outlaps. */
  readonly chequeredMs?: number | null;
}

interface SessionBestOwner {
  driverNumber: number;
  lapNumber: number;
  time: number;
}

interface TimingColumnVisibility {
  position: boolean;
  driver: boolean;
  alerts: boolean;
  bestLap: boolean;
  lastLap: boolean;
  gap: boolean;
  interval: boolean;
  s1: boolean;
  s2: boolean;
  s3: boolean;
  posDelta: boolean;
  tyre: boolean;
  pit: boolean;
  currentLap: boolean;
  speed: boolean;
  gear: boolean;
  rpm: boolean;
  thrBrk: boolean;
  drs: boolean;
}

interface SortedRow {
  driverNumber: number;
  displayPosition: number;
  eliminatedPhase: QualiPhase | null;
}

type TimingDisplayValue = number | string | null;

const Q3_GRID_SIZE = 10;
const LAP_SET_FLASH_MS = 4_000;

function fmtGap(val: TimingDisplayValue) {
  if (val === null) return "—";
  if (typeof val === "string") return val;
  if (val === 0) return "LEAD";
  return `+${val.toFixed(3)}`;
}

function fmtInterval(val: TimingDisplayValue) {
  if (val === null) return "—";
  if (typeof val === "string") return val;
  if (Math.abs(val) < 0.0005) return "—";
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

function StatusBadgeTooltip({
  label,
  tooltip,
  badgeClassName,
  tooltipAccentClassName,
  ariaLabel,
}: Readonly<{
  label: string;
  tooltip: string;
  badgeClassName: string;
  tooltipAccentClassName?: string;
  ariaLabel: string;
}>) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      const tooltipWidth = 224;
      const viewportPad = 8;
      const left = Math.min(
        Math.max(viewportPad, rect.left),
        window.innerWidth - tooltipWidth - viewportPad,
      );

      setPosition({
        top: rect.bottom + 8,
        left,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <span className="relative inline-flex shrink-0">
      <span
        ref={anchorRef}
        className={badgeClassName}
        aria-label={ariaLabel}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(!open)}
      >
        {label}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <TooltipCard
            title="Status"
            text={tooltip}
            accentClassName={tooltipAccentClassName}
            className="pointer-events-none fixed z-[9999] w-56 max-w-[calc(100vw-2rem)]"
            style={{ top: position.top, left: position.left }}
          />,
          document.body,
        )}
    </span>
  );
}

const LAP_TIME_COLOUR: Record<string, string> = {
  fastest: "text-[#9b59f5]",
  fast: "text-[#39b54a]",
  normal: "text-white",
  none: "text-muted",
};

const TH =
  "py-1.5 px-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#636369] select-none sm:px-2";

const TH_COMPACT =
  "py-1 px-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#636369] select-none sm:px-2";

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

function MobilePedalMeter({
  label,
  value,
  color,
  labelClassName,
}: {
  label: string;
  value: number | null;
  color: string;
  labelClassName: string;
}) {
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  const activeSegments = Math.round(clamped / 20);

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className={labelClassName}>{label}</span>
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => {
          const active = i < activeSegments;
          return (
            <span
              key={i}
              className="h-1.5 w-1 rounded-[2px]"
              style={{
                background: active
                  ? color
                  : value === null
                    ? "#2a2a35"
                    : "#30303a",
                opacity: active ? 1 : 0.65,
              }}
            />
          );
        })}
      </span>
    </span>
  );
}

function isRaceSession(sessionName?: string) {
  if (!sessionName) return false;
  const n = sessionName.toLowerCase();
  return n.includes("race") || n.includes("sprint");
}

function displayLastName(driver: Driver | undefined, driverNumber: number) {
  if (!driver) return String(driverNumber);
  if (driver.last_name) return driver.last_name;
  const parts = driver.full_name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.at(-1) ?? driver.name_acronym ?? String(driverNumber);
}

function classifyPenaltyStatus(
  description: string,
  kind: "penalty" | "investigation",
): "noted" | "investigating" | "penalty" | "cleared" {
  const lower = description.toLowerCase();
  if (/no further investigation|no action taken|not investigated/i.test(lower))
    return "cleared";
  if (
    /penalty served|served penalty|has served/i.test(lower) &&
    !/to be served/i.test(lower)
  ) {
    return "cleared";
  }
  if (
    /penalty|drive.through|stop.go|time penalty|grid drop|disqualif|reprimand|lap time deleted/i.test(
      lower,
    )
  ) {
    return "penalty";
  }
  if (/under investigation/i.test(lower)) return "investigating";
  if (/noted|alleged/i.test(lower)) return "noted";
  return kind === "penalty" ? "penalty" : "noted";
}

interface PenaltyMarkerState {
  status: "noted" | "investigating" | "penalty" | "cleared";
  detail: string;
}

function extractInvolvedDriverNumbers(description: string): number[] {
  const sections = [...description.matchAll(/\bCARS?\b([^\-.]*)/gi)];
  if (sections.length === 0) return [];
  const found = new Set<number>();
  for (const section of sections) {
    const matches = section[1]?.match(/\b\d{1,3}\b/g) ?? [];
    for (const value of matches) {
      found.add(Number(value));
    }
  }
  return [...found];
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
  showMinisectors = true,
  compactDriverColumn = false,
  wideSectors = false,
  dense = false,
  showDenseMobileTelemetry = false,
  showIntervalColumn = false,
  showFullLastName = false,
  showMobileAlertsColumn = true,
  showMobileBestLapColumn = true,
  showMobileGapColumn = true,
  showMobilePosDeltaColumn = true,
  showMobileTyreColumn = true,
  showMobilePitCountColumn = true,
  showMobileIntervalColumn = false,
  showMobileSectorsColumns = false,
  columnVisibility,
  sessionTimeMs,
  sessionStartMs,
  isLoading,
  totalLapCount = null,
  selectedDriver,
  onSelectDriver,
  fullWidthTable = false,
  chequeredMs = null,
}: Props) {
  const metricSystem = useSettings((s) => s.metricSystem);
  const lightMode = useSettings((s) => s.lightMode);
  const speedUnitShort = speedUnitLabel(metricSystem);
  const speedUnitCompact = speedUnitCompactLabel(metricSystem);
  const columns: TimingColumnVisibility = {
    position: true,
    driver: true,
    alerts: true,
    bestLap: true,
    lastLap: true,
    gap: true,
    interval: true,
    s1: true,
    s2: true,
    s3: true,
    posDelta: true,
    tyre: true,
    pit: true,
    currentLap: true,
    speed: true,
    gear: true,
    rpm: true,
    thrBrk: true,
    drs: true,
    ...columnVisibility,
  };
  const showTelemetry = carData !== undefined;
  const showDrs =
    showTelemetry &&
    carData !== undefined &&
    [...carData.values()].some(
      (c) => (c.drs as unknown as number | null) != null,
    );
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

  const startPosMap = useMemo(() => {
    const m = new Map<number, number>();
    const sortedByDate = [...positions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    for (const p of sortedByDate) {
      if (!m.has(p.driver_number)) m.set(p.driver_number, p.position);
    }
    return m;
  }, [positions]);

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

  const penaltyStatusByDriver = useMemo(() => {
    if (!sessionStartMs || raceControl.length === 0)
      return new Map<number, PenaltyMarkerState>();

    const visibleEvents = normalizeRaceControl(
      raceControl,
      sessionStartMs,
    ).filter((event) => event.ms <= sessionTimeMs);

    const byDriver = new Map<number, PenaltyMarkerState>();
    for (const event of visibleEvents) {
      if (event.kind !== "penalty" && event.kind !== "investigation") continue;

      const status = classifyPenaltyStatus(event.description, event.kind);
      const targets =
        event.driverNumber !== null
          ? [event.driverNumber]
          : extractInvolvedDriverNumbers(event.description);

      for (const driverNumber of targets) {
        byDriver.set(driverNumber, { status, detail: event.description });
      }
    }

    return byDriver;
  }, [raceControl, sessionStartMs, sessionTimeMs]);

  const pitCountMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of pits) {
      if (new Date(p.date).getTime() > currentT) continue;
      m.set(p.driver_number, (m.get(p.driver_number) ?? 0) + 1);
    }
    return m;
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

  const bestLapMap = useMemo(() => {
    const m = new Map<number, Lap & { lap_duration: number }>();
    for (const lap of completedLaps) {
      if (lap.lap_duration === null) continue;
      const prev = m.get(lap.driver_number);
      if (
        !prev ||
        lap.lap_duration < prev.lap_duration ||
        (lap.lap_duration === prev.lap_duration &&
          lap.lap_number < prev.lap_number)
      ) {
        m.set(lap.driver_number, lap as Lap & { lap_duration: number });
      }
    }
    return m;
  }, [completedLaps]);

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

  const referenceOrderMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const [driverNumber, position] of [...posMap.entries()].sort(
      (a, b) => a[1] - b[1],
    )) {
      m.set(driverNumber, position);
    }
    for (const [driverNumber, position] of [...startPosMap.entries()].sort(
      (a, b) => a[1] - b[1],
    )) {
      if (!m.has(driverNumber)) m.set(driverNumber, position);
    }
    for (const [driverNumber, position] of [...gridMap.entries()].sort(
      (a, b) => a[1] - b[1],
    )) {
      if (!m.has(driverNumber)) m.set(driverNumber, position);
    }
    const fallbackBase = m.size + 1;
    for (const d of drivers) {
      if (!m.has(d.driver_number)) {
        m.set(d.driver_number, fallbackBase + d.driver_number / 1000);
      }
    }
    return m;
  }, [posMap, startPosMap, gridMap, drivers]);

  const qualiPhase = useMemo(() => {
    if (!isQualiSession(sessionName ?? "")) return null;
    return detectQualiPhase(raceControl, sessionStartMs, sessionTimeMs);
  }, [raceControl, sessionName, sessionStartMs, sessionTimeMs]);

  const qualiPhaseStarts = useMemo(() => {
    let q2StartMs: number | null = null;
    let q3StartMs: number | null = null;
    for (const entry of raceControl) {
      const relMs = new Date(entry.date).getTime() - sessionStartMs;
      if (relMs > sessionTimeMs) break;
      const msg = (entry.message ?? "").toUpperCase();
      if (q2StartMs === null && /\bQ2\b/.test(msg)) q2StartMs = relMs;
      if (q3StartMs === null && /\bQ3\b/.test(msg)) q3StartMs = relMs;
    }
    return { q2StartMs, q3StartMs };
  }, [raceControl, sessionStartMs, sessionTimeMs]);

  const timedOrder = useMemo(() => {
    const activeDriverNumbers = new Set<number>();
    drivers.forEach((d) => activeDriverNumbers.add(d.driver_number));
    posMap.forEach((_, driverNumber) => activeDriverNumbers.add(driverNumber));
    const fieldSize = Math.max(activeDriverNumbers.size, drivers.length);
    const eliminatedTotal = Math.max(0, fieldSize - Q3_GRID_SIZE);
    const q1EliminationCount = Math.floor(eliminatedTotal / 2);
    const q2EliminationCount = eliminatedTotal - q1EliminationCount;

    const completed = laps
      .filter(
        (lap): lap is Lap & { date_start: string; lap_duration: number } =>
          !!lap.date_start && lap.lap_duration !== null,
      )
      .map((lap) => ({
        ...lap,
        endMs: new Date(lap.date_start).getTime() + lap.lap_duration * 1000,
      }))
      .sort((a, b) => a.endMs - b.endMs);

    const referenceAt = (driverNumber: number) =>
      referenceOrderMap.get(driverNumber) ?? Number.MAX_SAFE_INTEGER;

    const rankAt = (cutoffAbsMs: number) => {
      const bestByDriver = new Map<number, number>();
      for (const lap of completed) {
        if (lap.endMs > cutoffAbsMs) break;
        const prev = bestByDriver.get(lap.driver_number);
        if (prev === undefined || lap.lap_duration < prev) {
          bestByDriver.set(lap.driver_number, lap.lap_duration);
        }
      }

      return [...activeDriverNumbers].sort((a, b) => {
        const aBest = bestByDriver.get(a) ?? null;
        const bBest = bestByDriver.get(b) ?? null;
        if (aBest !== null && bBest !== null && aBest !== bBest)
          return aBest - bBest;
        if (aBest !== null && bBest === null) return -1;
        if (aBest === null && bBest !== null) return 1;
        return referenceAt(a) - referenceAt(b);
      });
    };

    const currentOrder = rankAt(currentT);

    if (!isQualiSession(sessionName ?? "") || !qualiPhase) {
      return {
        order: currentOrder,
        eliminatedQ1: [] as number[],
        eliminatedQ2: [] as number[],
      };
    }

    const q1CutoffAbs =
      qualiPhaseStarts.q2StartMs !== null
        ? sessionStartMs + Math.max(0, qualiPhaseStarts.q2StartMs - 1)
        : currentT;
    const q1Ranking = rankAt(q1CutoffAbs);
    const eliminatedQ1 = q1Ranking.slice(
      Math.max(0, q1Ranking.length - q1EliminationCount),
    );

    if (qualiPhase === "Q2") {
      const active = currentOrder.filter((n) => !eliminatedQ1.includes(n));
      return {
        order: [...active, ...eliminatedQ1],
        eliminatedQ1,
        eliminatedQ2: [] as number[],
      };
    }

    const q2CutoffAbs =
      qualiPhaseStarts.q3StartMs !== null
        ? sessionStartMs + Math.max(0, qualiPhaseStarts.q3StartMs - 1)
        : currentT;
    const q2Ranking = rankAt(q2CutoffAbs).filter(
      (n) => !eliminatedQ1.includes(n),
    );
    const eliminatedQ2 = q2Ranking.slice(
      Math.max(0, q2Ranking.length - q2EliminationCount),
    );
    const active = currentOrder.filter(
      (n) => !eliminatedQ1.includes(n) && !eliminatedQ2.includes(n),
    );

    return {
      order: [...active, ...eliminatedQ2, ...eliminatedQ1],
      eliminatedQ1,
      eliminatedQ2,
    };
  }, [
    drivers,
    posMap,
    laps,
    currentT,
    referenceOrderMap,
    sessionName,
    qualiPhase,
    qualiPhaseStarts.q2StartMs,
    qualiPhaseStarts.q3StartMs,
    sessionStartMs,
  ]);

  const sorted = useMemo<SortedRow[]>(() => {
    const timed = isTimedSession(sessionName ?? "");
    if (timed) {
      return timedOrder.order.map((driverNumber, idx) => {
        let eliminatedPhase: QualiPhase | null = null;
        if (timedOrder.eliminatedQ2.includes(driverNumber)) {
          eliminatedPhase = "Q2";
        } else if (timedOrder.eliminatedQ1.includes(driverNumber)) {
          eliminatedPhase = "Q1";
        }

        return {
          driverNumber,
          displayPosition: idx + 1,
          eliminatedPhase,
        };
      });
    }

    return [...posMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([driverNumber, displayPosition]) => ({
        driverNumber,
        displayPosition,
        eliminatedPhase: null,
      }));
  }, [posMap, sessionName, timedOrder]);

  const leaderBestLap = useMemo(() => {
    const leader = sorted[0];
    if (!leader) return null;
    return bestLapMap.get(leader.driverNumber)?.lap_duration ?? null;
  }, [sorted, bestLapMap]);

  const hasSectorReference = Boolean(
    sessionBestOwners.s1 || sessionBestOwners.s2 || sessionBestOwners.s3,
  );
  const leaderboardDense = dense && fullWidthTable;
  const headerCellClass = leaderboardDense ? TH_COMPACT : TH;

  const driverColClass = compactDriverColumn
    ? `${headerCellClass} text-left w-[4.75rem] min-[390px]:w-[5.25rem] sm:w-[4.5rem] lg:w-[4.75rem]`
    : `${headerCellClass} text-left w-[5.25rem] min-[390px]:w-[5.75rem] sm:w-[5rem] lg:w-[5.25rem]`;

  const driverCellClass = compactDriverColumn
    ? "py-3 px-0 sm:px-0.5"
    : "py-3 px-0 sm:px-0.5";

  const sectorBarWidthClass = wideSectors ? "w-14" : "w-7";
  let rowCellPad = "py-3";
  if (leaderboardDense) rowCellPad = "py-0.5";
  else if (dense) rowCellPad = "py-0";
  const sectorHeaderWidthClass = wideSectors
    ? "w-[4rem] lg:w-[4.5rem]"
    : "w-[2.8rem] lg:w-[3rem]";
  const sectorCellClass = `${rowCellPad} ${wideSectors ? "px-1" : "px-0"}`;
  const trackerTelemetryColumnsClass = compactDriverColumn && !fullWidthTable;
  const speedColumnClass = trackerTelemetryColumnsClass
    ? "hidden md:table-cell"
    : "hidden lg:table-cell";
  const gearColumnClass = trackerTelemetryColumnsClass
    ? "hidden md:table-cell"
    : "hidden lg:table-cell";
  const rpmColumnClass = trackerTelemetryColumnsClass
    ? "hidden md:table-cell"
    : "hidden 2xl:table-cell";
  const pedalColumnClass = trackerTelemetryColumnsClass
    ? "hidden md:table-cell"
    : "hidden lg:table-cell";
  const drsColumnClass = trackerTelemetryColumnsClass
    ? "hidden md:table-cell"
    : "hidden lg:table-cell";
  const telemetryPadClass = compactDriverColumn ? "px-1" : "px-2";
  const telemetryCenterPadClass = compactDriverColumn ? "px-0.5" : "px-1";
  const pedalHeaderWidthClass = compactDriverColumn ? "w-[3.5rem]" : "w-[4rem]";
  const drsHeaderWidthClass = compactDriverColumn ? "w-[2.5rem]" : "w-[3rem]";
  const pedalBarsWidthClass = compactDriverColumn ? "w-10" : "w-12";
  const tableMinWidthClass = showTelemetry
    ? compactDriverColumn
      ? "min-w-[62rem]"
      : "min-w-[70rem]"
    : compactDriverColumn
      ? "min-w-[52rem]"
      : "min-w-[58rem]";

  const driverCellCompactClass = dense
    ? "py-0.5 px-1 sm:px-1.5"
    : "py-1 px-1 sm:px-1.5";
  const statusBadgeClass = dense
    ? "inline-flex h-3 items-center px-0.5 text-[7px] leading-none"
    : "inline-block text-[8px] px-1 py-0.5";
  let rowHeightClass = showTelemetry && !dense ? "h-auto sm:h-11" : "h-11";
  if (fullWidthTable) rowHeightClass = "h-8";
  else if (dense) rowHeightClass = "h-[30px]";

  const timingStripClass = lightMode
    ? "border-b border-slate-200 bg-white/95"
    : "border-b border-[#2a2a35] bg-surface/80";
  const timingHeaderRowClass = lightMode
    ? "sticky top-0 z-10 border-b border-slate-200 bg-white"
    : "sticky top-0 z-10 border-b border-[#38383f] bg-track";
  const timingRowBaseClass = lightMode
    ? "border-b border-slate-200 transition-colors"
    : "border-b border-[#1e1e28] transition-colors";
  const mobileAlertsColumnClass =
    showMobileAlertsColumn && columns.alerts ? "" : "hidden sm:table-cell";
  const mobileBestLapColumnClass =
    showMobileBestLapColumn && columns.bestLap ? "" : "hidden sm:table-cell";
  const mobileLastLapColumnClass = columns.lastLap ? "" : "hidden";
  const mobileGapColumnClass =
    showMobileGapColumn && columns.gap ? "" : "hidden sm:table-cell";
  const mobilePosDeltaColumnClass =
    showMobilePosDeltaColumn && columns.posDelta ? "" : "hidden sm:table-cell";
  const mobileTyreColumnClass =
    showMobileTyreColumn && columns.tyre ? "" : "hidden sm:table-cell";
  const mobilePitCountColumnClass =
    showMobilePitCountColumn && columns.pit ? "" : "hidden sm:table-cell";
  const mobileIntervalColumnClass =
    showMobileIntervalColumn && columns.interval ? "" : "hidden sm:table-cell";
  const mobileS1ColumnClass =
    showMobileSectorsColumns && columns.s1 ? "" : "hidden sm:table-cell";
  const mobileS2ColumnClass =
    showMobileSectorsColumns && columns.s2 ? "" : "hidden sm:table-cell";
  const mobileS3ColumnClass =
    showMobileSectorsColumns && columns.s3 ? "" : "hidden sm:table-cell";

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
      {!dense && (
        <div className={timingStripClass + " px-2 py-2 sm:px-3"}>
          {hasSectorReference ? (
            <>
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
                  Sector references will appear as soon as timed laps are
                  registered.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table
          className={`${fullWidthTable ? "w-full" : "w-max min-w-full"} ${tableMinWidthClass} border-collapse table-auto`}
        >
          <thead>
            <tr className={timingHeaderRowClass}>
              {columns.position && (
                <th className={`${headerCellClass} text-left w-8`}>P</th>
              )}
              {columns.driver && <th className={driverColClass}>Driver</th>}
              {columns.alerts && (
                <th
                  className={`${mobileAlertsColumnClass} ${headerCellClass} text-center w-[2rem] lg:w-[2.25rem]`}
                >
                  Alerts
                </th>
              )}
              {columns.bestLap && (
                <th
                  className={`${mobileBestLapColumnClass} ${headerCellClass} text-right w-[4.25rem] min-[390px]:w-[4.75rem] sm:w-[5rem]`}
                >
                  Best Lap
                </th>
              )}
              {columns.lastLap && (
                <th
                  className={`${mobileLastLapColumnClass} ${headerCellClass} text-right w-[4.25rem] min-[390px]:w-[4.75rem] sm:w-[5rem]`}
                >
                  Last Lap
                </th>
              )}
              {columns.gap && (
                <th
                  className={`${mobileGapColumnClass} ${headerCellClass} text-right w-[4.25rem] min-[390px]:w-[4.75rem] sm:w-[5rem]`}
                >
                  Gap
                </th>
              )}
              {showIntervalColumn && columns.interval && (
                <th
                  className={`${mobileIntervalColumnClass} ${headerCellClass} text-right w-[4.25rem] min-[390px]:w-[4.75rem] sm:w-[5rem]`}
                >
                  Interval
                </th>
              )}
              {columns.s1 && (
                <th
                  className={`${mobileS1ColumnClass} ${headerCellClass} text-center ${sectorHeaderWidthClass}`}
                >
                  S1
                </th>
              )}
              {columns.s2 && (
                <th
                  className={`${mobileS2ColumnClass} ${headerCellClass} text-center ${sectorHeaderWidthClass}`}
                >
                  S2
                </th>
              )}
              {columns.s3 && (
                <th
                  className={`${mobileS3ColumnClass} ${headerCellClass} text-center ${sectorHeaderWidthClass}`}
                >
                  S3
                </th>
              )}
              {columns.posDelta && (
                <th
                  className={`${mobilePosDeltaColumnClass} ${headerCellClass} text-left w-[2.75rem] min-[390px]:w-[2.25rem] sm:w-[2.5rem]`}
                >
                  Pos
                </th>
              )}
              {columns.tyre && (
                <th
                  className={`${mobileTyreColumnClass} ${headerCellClass} text-left w-[2.25rem] lg:w-[2.5rem]`}
                >
                  Tyre
                </th>
              )}
              {columns.pit && (
                <th
                  className={`${mobilePitCountColumnClass} ${headerCellClass} text-center w-[2.25rem] lg:w-[2.5rem]`}
                >
                  Pit
                </th>
              )}
              {columns.currentLap && (
                <th
                  className={`${headerCellClass} hidden sm:table-cell text-center w-16`}
                >
                  Lap
                </th>
              )}
              {showTelemetry && (
                <>
                  {columns.speed && (
                    <th
                      className={`${headerCellClass} ${speedColumnClass} text-right w-[3rem]`}
                    >
                      <span className="block leading-none">Speed</span>
                      <span className="block text-[8px] normal-case tracking-normal text-[#7b7b82] leading-none mt-0.5">
                        {speedUnitShort}
                      </span>
                    </th>
                  )}
                  {columns.gear && (
                    <th
                      className={`${headerCellClass} ${gearColumnClass} text-center w-6`}
                    >
                      Gear
                    </th>
                  )}
                  {columns.rpm && (
                    <th
                      className={`${headerCellClass} ${rpmColumnClass} text-right w-[3.5rem]`}
                    >
                      RPM
                    </th>
                  )}
                  {columns.thrBrk && (
                    <th
                      className={`${headerCellClass} ${pedalColumnClass} text-center ${pedalHeaderWidthClass}`}
                    >
                      Thr/Brk
                    </th>
                  )}
                  {showDrs && columns.drs && (
                    <th
                      className={`${headerCellClass} ${drsColumnClass} text-center ${drsHeaderWidthClass}`}
                    >
                      DRS
                    </th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const num = row.driverNumber;
              const pos = row.displayPosition;
              const driver = driverByNumber.get(num);
              const intData = intMap.get(num);
              const color = teamColor(driver?.team_colour);
              const inPit = pittingNow.has(num);
              const penaltyMarker = penaltyStatusByDriver.get(num) ?? null;
              const penaltyStatus = penaltyMarker?.status ?? null;
              const markerDetail = penaltyMarker?.detail ?? null;
              const hasInvestigationMarker =
                penaltyStatus === "investigating" || penaltyStatus === "noted";
              const hasPenaltyMarker = penaltyStatus === "penalty";
              const investigationTitle = markerDetail
                ? `Under investigation: ${markerDetail}`
                : "Under investigation";
              const penaltyTitle = markerDetail
                ? `Penalty issued: ${markerDetail}`
                : "Penalty issued";
              const lastLap = lastLapMap.get(num) ?? null;
              const bestLap = bestLapMap.get(num) ?? null;
              const currentLap = currentLapMap.get(num) ?? null;
              const car = carData?.get(num) ?? null;
              const mobileDriverLabel = driver?.name_acronym ?? num;
              const driverLabel = showFullLastName
                ? displayLastName(driver, num)
                : mobileDriverLabel;
              const speedValue = car
                ? Math.round(toDisplaySpeed(car.speed, metricSystem))
                : null;
              const speedDisplay =
                speedValue !== null
                  ? String(speedValue).padStart(3, "0")
                  : "---";
              const rpmDisplay = car
                ? String(Math.round(car.rpm)).padStart(5, "0")
                : "-----";
              const gearDisplay = car
                ? String(car.n_gear === 0 ? "N" : car.n_gear)
                : "-";
              const drsDisplay = car ? (car.drs >= 10 ? "ON" : "OFF") : "--";
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
                bestLap?.lap_duration ?? null,
                sessionBest.lap,
              );

              const startPos = gridMap.get(num) ?? startPosMap.get(num) ?? null;
              const gained = startPos !== null ? startPos - pos : null;
              const retired = retiredDrivers.has(num);
              const eliminated = row.eliminatedPhase !== null;
              const selected = selectedDriver === num;

              const timedGap =
                leaderBestLap !== null && bestLap?.lap_duration !== undefined
                  ? Math.max(0, bestLap.lap_duration - leaderBestLap)
                  : null;
              let gapValue: TimingDisplayValue = intData?.gap_to_leader ?? null;
              if (isTimedSession(sessionName ?? "")) {
                gapValue = pos === 1 ? 0 : timedGap;
              }
              const previousDriverNumber =
                sorted[idx - 1]?.driverNumber ?? null;
              const previousBestLap =
                previousDriverNumber !== null
                  ? (bestLapMap.get(previousDriverNumber)?.lap_duration ?? null)
                  : null;
              let intervalValue: TimingDisplayValue = intData?.interval ?? null;
              if (isTimedSession(sessionName ?? "")) {
                intervalValue =
                  previousBestLap !== null &&
                  bestLap?.lap_duration !== undefined
                    ? Math.max(0, bestLap.lap_duration - previousBestLap)
                    : null;
              }

              // Check if the last lap is a post-race outlap
              const isOutlap =
                lastLap?.date_start !== undefined &&
                lastLap.date_start !== null &&
                chequeredMs !== undefined &&
                chequeredMs !== null &&
                new Date(lastLap.date_start).getTime() - sessionStartMs >=
                  chequeredMs;

              const lastLapEndMs =
                lastLap?.date_start && lastLap.lap_duration !== null
                  ? new Date(lastLap.date_start).getTime() +
                    lastLap.lap_duration * 1000
                  : null;
              const justSetLap =
                isTimedSession(sessionName ?? "") &&
                lastLapEndMs !== null &&
                currentT >= lastLapEndMs &&
                currentT - lastLapEndMs <= LAP_SET_FLASH_MS;
              const lastLapIsBest =
                justSetLap &&
                bestLap !== null &&
                lastLap !== null &&
                bestLap.lap_number === lastLap.lap_number;

              let rowBg = "hover:bg-white/[0.06]";
              if (selected) rowBg = "bg-[#2a2a35]";
              else if (eliminated) rowBg = "bg-[#22162e]/70";
              else if (retired) rowBg = "opacity-50";
              else if (idx % 2 === 1)
                rowBg = "bg-white/[0.02] hover:bg-white/[0.06]";

              let lapFlashClass = "";
              if (justSetLap) {
                lapFlashClass = lastLapIsBest
                  ? "ring-1 ring-inset ring-[#39d743]/60 bg-[#173726]/45"
                  : "ring-1 ring-inset ring-[#3ea6ff]/55 bg-[#11263a]/45";
              }

              let statusContent: ReactNode = null;
              if (eliminated) {
                statusContent = (
                  <span
                    className={`inline-flex bg-[#3a214a] text-[#e7c7ff] font-black uppercase tracking-widest ${statusBadgeClass}`}
                  >
                    OUT {row.eliminatedPhase}
                  </span>
                );
              } else if (retired) {
                statusContent = (
                  <span
                    className={`hidden min-[390px]:inline-flex bg-[#3a1010] text-[#ff5252] font-black uppercase tracking-widest ${statusBadgeClass}`}
                  >
                    RET
                  </span>
                );
              } else if (isOutlap) {
                statusContent = (
                  <span
                    className={`bg-[#4b5563] text-[#d0d5dd] font-black uppercase tracking-widest ${statusBadgeClass}`}
                  >
                    OUTLAP
                  </span>
                );
              } else if (inPit) {
                statusContent = (
                  <span
                    className={`bg-[#f5a623] text-black font-black uppercase tracking-widest animate-pulse ${statusBadgeClass}`}
                  >
                    PIT
                  </span>
                );
              }

              let gainedContent: ReactNode;
              if (gained === null || gained === 0) {
                gainedContent = (
                  <span className="inline-flex items-center gap-1 text-[#8a8a91]">
                    <span aria-hidden="true">-</span>
                    <span>0</span>
                  </span>
                );
              } else if (gained > 0) {
                gainedContent = (
                  <span className="inline-flex items-center gap-1 text-[#39d743]">
                    <span aria-hidden="true">↑</span>
                    <span>{gained}</span>
                  </span>
                );
              } else {
                gainedContent = (
                  <span className="inline-flex items-center gap-1 text-[#ffd400]">
                    <span aria-hidden="true">↓</span>
                    <span>{Math.abs(gained)}</span>
                  </span>
                );
              }

              return (
                <tr
                  key={num}
                  onClick={() => onSelectDriver?.(num)}
                  className={`${timingRowBaseClass} ${rowHeightClass} ${onSelectDriver ? "cursor-pointer" : ""} ${rowBg} ${lapFlashClass}`}
                >
                  {/* Position */}
                  {columns.position && (
                    <td
                      className={`${rowCellPad} align-middle px-1.5 font-black ${dense ? "text-xs" : "text-sm"} tabular-nums text-white/90 sm:px-2`}
                    >
                      {pos}
                    </td>
                  )}

                  {/* Driver */}
                  {columns.driver && (
                    <td
                      className={`${dense ? driverCellCompactClass : driverCellClass} align-middle`}
                    >
                      <div>
                        <span className="flex items-center gap-1 sm:gap-1">
                          <DriverHeadshot
                            driver={driver}
                            accent={color}
                            size={dense ? "xxs" : "xs"}
                          />
                          {/* Team colour bar */}
                          <span
                            className={`w-[2px] ${dense ? "h-3" : "h-4"} shrink-0 rounded-sm`}
                            style={{ background: color }}
                          />
                          {/* Surname in CAPS */}
                          <span
                            className={`min-w-0 truncate font-bold ${dense ? "text-[9px] min-[390px]:text-[10px]" : "text-[10px] min-[390px]:text-[11px]"} tracking-[0.03em] min-[390px]:tracking-[0.05em] uppercase text-white`}
                          >
                            {showFullLastName ? (
                              <>
                                <span className="sm:hidden">
                                  {mobileDriverLabel}
                                </span>
                                <span className="hidden sm:inline">
                                  {driverLabel}
                                </span>
                              </>
                            ) : (
                              driverLabel
                            )}
                          </span>
                        </span>

                        {showTelemetry &&
                          (!dense || showDenseMobileTelemetry) && (
                            <div
                              className={`grid grid-cols-2 gap-x-1.5 gap-y-0.5 font-mono tabular-nums sm:hidden ${dense ? "mt-0.5 text-[8px] leading-3.5" : "mt-1 text-[9px] leading-4"}`}
                            >
                              {columns.speed && (
                                <span className="inline-flex min-w-0 items-center gap-1 text-[#7dd3fc]">
                                  <span className="text-[#89a6bf]">
                                    {speedUnitCompact}
                                  </span>
                                  <span className="w-[3ch] text-right">
                                    {speedDisplay}
                                  </span>
                                </span>
                              )}
                              {columns.rpm && (
                                <span className="inline-flex min-w-0 items-center gap-1 text-[#c4b5fd]">
                                  <span className="text-[#a79ac9]">RPM</span>
                                  <span className="w-[5ch] text-right">
                                    {rpmDisplay}
                                  </span>
                                </span>
                              )}
                              {columns.gear && (
                                <span className="inline-flex min-w-0 items-center gap-1 text-[#fde68a]">
                                  <span className="text-[#d2bf72]">G</span>
                                  <span className="w-[3ch] text-right">
                                    {gearDisplay}
                                  </span>
                                </span>
                              )}
                              {showDrs && columns.drs && (
                                <span
                                  className={`inline-flex min-w-0 items-center gap-1 ${car && car.drs >= 10 ? "text-[#39d743]" : "text-[#9ca3af]"}`}
                                >
                                  <span className="text-[#9ba1a8]">DRS</span>
                                  <span className="w-[3ch] text-right">
                                    {drsDisplay}
                                  </span>
                                </span>
                              )}
                              {columns.thrBrk && (
                                <span className="col-span-2 inline-flex min-w-0 items-center justify-start gap-1.5">
                                  <MobilePedalMeter
                                    label="T"
                                    value={car ? car.throttle : null}
                                    color="#39d743"
                                    labelClassName="text-[#6eb989]"
                                  />
                                  <MobilePedalMeter
                                    label="B"
                                    value={car ? car.brake : null}
                                    color="#ff5252"
                                    labelClassName="text-[#c88787]"
                                  />
                                </span>
                              )}
                            </div>
                          )}
                      </div>
                    </td>
                  )}

                  {/* Alerts: investigation/penalty markers + driver status */}
                  {columns.alerts && (
                    <td
                      className={`${mobileAlertsColumnClass} ${rowCellPad} align-middle px-0 text-center font-black ${dense ? "text-[8px]" : "text-[8px] min-[390px]:text-[9px]"} tabular-nums sm:px-0.5`}
                    >
                      {(hasInvestigationMarker ||
                        hasPenaltyMarker ||
                        statusContent) && (
                        <span className="inline-flex items-center justify-center gap-1">
                          {hasInvestigationMarker && (
                            <StatusBadgeTooltip
                              label="!"
                              tooltip={investigationTitle}
                              ariaLabel="Under investigation"
                              badgeClassName={`bg-[#f5a623] text-black font-black uppercase tracking-widest cursor-help ${statusBadgeClass}`}
                              tooltipAccentClassName="bg-[#f5a623]"
                            />
                          )}
                          {hasPenaltyMarker && (
                            <StatusBadgeTooltip
                              label="!"
                              tooltip={penaltyTitle}
                              ariaLabel="Penalty issued"
                              badgeClassName={`bg-[#ff5252] text-white font-black uppercase tracking-widest cursor-help ${statusBadgeClass}`}
                              tooltipAccentClassName="bg-[#ff5252]"
                            />
                          )}
                          {statusContent}
                        </span>
                      )}
                      {!hasInvestigationMarker &&
                        !hasPenaltyMarker &&
                        !statusContent && <span className="text-muted">—</span>}
                    </td>
                  )}

                  {/* Best lap time */}
                  {columns.bestLap && (
                    <td
                      className={`${mobileBestLapColumnClass} ${rowCellPad} align-middle px-1 text-right font-mono ${dense ? "text-[9px] min-[390px]:text-[10px]" : "text-[10px] min-[390px]:text-[11px]"} tabular-nums sm:px-1.5 ${LAP_TIME_COLOUR[lapTier]}`}
                    >
                      {fmtTime(bestLap?.lap_duration ?? null)}
                    </td>
                  )}

                  {columns.lastLap && (
                    <td
                      className={`${mobileLastLapColumnClass} ${rowCellPad} align-middle px-1 text-right font-mono ${dense ? "text-[9px] min-[390px]:text-[10px]" : "text-[10px] min-[390px]:text-[11px]"} tabular-nums sm:px-1.5 ${LAP_TIME_COLOUR[lapTimeTier(lastLap?.lap_duration ?? null, sessionBest.lap)]}`}
                    >
                      {fmtTime(lastLap?.lap_duration ?? null)}
                    </td>
                  )}

                  {/* Gap to leader */}
                  {columns.gap && (
                    <td
                      className={`${mobileGapColumnClass} ${rowCellPad} align-middle px-1 text-right font-mono ${dense ? "text-[9px] min-[390px]:text-[10px]" : "text-[10px] min-[390px]:text-[11px]"} tabular-nums text-muted sm:px-2`}
                    >
                      {fmtGap(gapValue)}
                    </td>
                  )}

                  {/* Interval to car ahead */}
                  {showIntervalColumn && columns.interval && (
                    <td
                      className={`${mobileIntervalColumnClass} ${rowCellPad} align-middle px-1 text-right font-mono ${dense ? "text-[9px] min-[390px]:text-[10px]" : "text-[10px] min-[390px]:text-[11px]"} tabular-nums text-muted sm:px-2`}
                    >
                      {fmtInterval(intervalValue)}
                    </td>
                  )}

                  {/* Sector bars */}
                  {columns.s1 && (
                    <td
                      className={`${mobileS1ColumnClass} align-middle ${sectorCellClass}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <SectorBar
                          tier={t1}
                          segments={lastLap?.segments_sector_1}
                          showMinisectors={showMinisectors}
                          widthClass={sectorBarWidthClass}
                          title={`S1: ${lastLap?.duration_sector_1?.toFixed(3) ?? "—"}`}
                        />
                        {wideSectors && (
                          <span className="text-[9px] font-mono tabular-nums text-muted leading-none">
                            {lastLap?.duration_sector_1?.toFixed(3) ?? "—"}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {columns.s2 && (
                    <td
                      className={`${mobileS2ColumnClass} align-middle ${sectorCellClass}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <SectorBar
                          tier={t2}
                          segments={lastLap?.segments_sector_2}
                          showMinisectors={showMinisectors}
                          widthClass={sectorBarWidthClass}
                          title={`S2: ${lastLap?.duration_sector_2?.toFixed(3) ?? "—"}`}
                        />
                        {wideSectors && (
                          <span className="text-[9px] font-mono tabular-nums text-muted leading-none">
                            {lastLap?.duration_sector_2?.toFixed(3) ?? "—"}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {columns.s3 && (
                    <td
                      className={`${mobileS3ColumnClass} align-middle ${sectorCellClass}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <SectorBar
                          tier={t3}
                          segments={lastLap?.segments_sector_3}
                          showMinisectors={showMinisectors}
                          widthClass={sectorBarWidthClass}
                          title={`S3: ${lastLap?.duration_sector_3?.toFixed(3) ?? "—"}`}
                        />
                        {wideSectors && (
                          <span className="text-[9px] font-mono tabular-nums text-muted leading-none">
                            {lastLap?.duration_sector_3?.toFixed(3) ?? "—"}
                          </span>
                        )}
                      </div>
                    </td>
                  )}

                  {/* Position gain/loss from start */}
                  {columns.posDelta && (
                    <td
                      className={`${mobilePosDeltaColumnClass} ${rowCellPad} align-middle px-1 text-left font-black ${dense ? "text-[11px]" : "text-xs min-[390px]:text-sm"} tabular-nums sm:px-2`}
                      title={
                        startPos !== null
                          ? `Started P${startPos}`
                          : "Starting position unavailable"
                      }
                    >
                      {gainedContent}
                    </td>
                  )}

                  {/* Tyre: starting compound → current compound + age */}
                  {columns.tyre && (
                    <td
                      className={`${mobileTyreColumnClass} ${rowCellPad} align-middle px-1 sm:px-1.5`}
                    >
                      <TyreBadge
                        stints={stints ?? []}
                        driverNumber={num}
                        currentLap={currentLap}
                        startCompound={
                          wideSectors
                            ? (startCompoundMap.get(num) ?? null)
                            : null
                        }
                      />
                    </td>
                  )}

                  {/* Pit stops completed up to current playhead */}
                  {columns.pit && (
                    <td
                      className={`${mobilePitCountColumnClass} ${rowCellPad} align-middle px-1 text-center font-mono ${dense ? "text-[10px]" : "text-[11px] min-[390px]:text-[12px]"} tabular-nums text-muted sm:px-1.5`}
                    >
                      {pitCountMap.get(num) ?? 0}
                    </td>
                  )}

                  {/* Current lap */}
                  {columns.currentLap && (
                    <td
                      className={`hidden sm:table-cell ${rowCellPad} align-middle px-2 text-center font-mono ${dense ? "text-[10px]" : "text-[11px]"} tabular-nums text-muted`}
                    >
                      {currentLap !== null && totalLapCount !== null
                        ? `${currentLap}/${totalLapCount}`
                        : (currentLap ?? "—")}
                    </td>
                  )}

                  {/* Live car telemetry */}
                  {showTelemetry && (
                    <>
                      {/* Speed */}
                      {columns.speed && (
                        <td
                          className={`${speedColumnClass} ${rowCellPad} align-middle ${telemetryPadClass} text-right font-mono text-[12px] tabular-nums text-white`}
                        >
                          {speedValue ?? "—"}
                        </td>
                      )}
                      {/* Gear */}
                      {columns.gear && (
                        <td
                          className={`${gearColumnClass} ${rowCellPad} align-middle ${telemetryCenterPadClass} text-center font-mono text-[12px] tabular-nums text-white/90`}
                        >
                          {car ? (car.n_gear === 0 ? "N" : car.n_gear) : "—"}
                        </td>
                      )}
                      {/* RPM */}
                      {columns.rpm && (
                        <td
                          className={`${rpmColumnClass} ${rowCellPad} align-middle ${telemetryPadClass} text-right font-mono text-[10px] tabular-nums text-muted`}
                        >
                          {car ? Math.round(car.rpm) : "—"}
                        </td>
                      )}
                      {/* Throttle / brake mini bars */}
                      {columns.thrBrk && (
                        <td
                          className={`${pedalColumnClass} ${rowCellPad} align-middle ${telemetryCenterPadClass}`}
                        >
                          {car ? (
                            <span
                              className={`flex flex-col gap-0.5 ${pedalBarsWidthClass} mx-auto`}
                            >
                              <MiniBar value={car.throttle} color="#39d743" />
                              <MiniBar value={car.brake} color="#ff5252" />
                            </span>
                          ) : (
                            <span className="block text-center text-muted">
                              —
                            </span>
                          )}
                        </td>
                      )}
                      {/* DRS */}
                      {showDrs && columns.drs && (
                        <td
                          className={`${drsColumnClass} ${rowCellPad} align-middle ${telemetryCenterPadClass} text-center`}
                        >
                          {car ? (
                            <span
                              className={`mx-auto flex min-w-[2rem] items-center justify-center px-1 py-0.5 text-center leading-none text-[9px] font-black uppercase tracking-[0.08em] ${
                                car.drs >= 10
                                  ? "bg-[#39d743] text-black"
                                  : "bg-panel text-[#636369]"
                              }`}
                              title={`DRS raw value ${car.drs}`}
                            >
                              {car.drs >= 10 ? "ON" : "OFF"}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(LiveTiming);
