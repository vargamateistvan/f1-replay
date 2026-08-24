import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lap } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import {
  computeTrackAutoRotationDeg,
  locationToSvg,
  useTrackOutline,
} from "@/hooks/useTrackMap";
import { useSearchParams } from "react-router-dom";
import {
  useCarDataForLap,
  type TelemetrySample,
} from "@/hooks/useCarDataForLap";
import { useDrivers, useLaps, useSessions } from "@/hooks/useSession";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { computeDelta, resampleToAxis, smooth } from "@/utils/telemetry";
import { speedUnitLabel, toDisplaySpeed } from "@/utils/units";
import { toSafeExternalUrl } from "@/utils/url";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { trackEvent } from "@/lib/analytics";

interface PlotSlot {
  num: number;
  label: string;
  color: string;
  data: TelemetrySample[];
}

interface SplitRow {
  num: number;
  lapNo: number;
  color: string;
  acr: string;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  lap: number | null;
  i1: number | null;
  i2: number | null;
  st: number | null;
}

interface LapMeta {
  timeText: string;
  statusLabel: string;
  statusClass: string;
}

interface SparklineStats {
  min: number;
  max: number;
  avg: number;
}

interface DeltaHint {
  text: string;
  className: string;
}

interface SectorWins {
  s1: boolean;
  s2: boolean;
  s3: boolean;
  total: number;
}

interface TrackMarker {
  driver: number;
  sx: number;
  sy: number;
  color: string;
  label: string;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  drs: number;
  distM: number;
  timeS: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  i1: number | null;
  i2: number | null;
  st: number | null;
  seg1: readonly number[] | null;
  seg2: readonly number[] | null;
  seg3: readonly number[] | null;
}


interface TrackPreviewPoint {
  sx: number;
  sy: number;
  dist: number;
}

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-panel uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const LABEL = "text-[10px] font-bold uppercase tracking-widest text-muted";
const SELECT =
  "bg-track text-white border border-panel text-xs font-medium px-3 py-2 focus:outline-none focus:border-muted transition-colors";
const SLOT_COLORS = ["#e8002d", "#0067ff", "#23c552"];
const EMPTY_SECTOR_WINS: SectorWins = {
  s1: false,
  s2: false,
  s3: false,
  total: 0,
};
const TRACK_SVG_W = 360;
const TRACK_SVG_H = 180;

function interpolateTrackPoint(
  points: TrackPreviewPoint[],
  targetDist: number,
): { sx: number; sy: number } | null {
  if (points.length === 0) return null;
  if (targetDist <= 0) {
    const first = points[0]!;
    return { sx: first.sx, sy: first.sy };
  }

  const last = points[points.length - 1]!;
  if (targetDist >= last.dist) return { sx: last.sx, sy: last.sy };

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid]!.dist < targetDist) lo = mid + 1;
    else hi = mid;
  }

  const right = points[lo]!;
  const left = points[Math.max(0, lo - 1)]!;
  const span = Math.max(1e-6, right.dist - left.dist);
  const t = Math.max(0, Math.min(1, (targetDist - left.dist) / span));
  return {
    sx: left.sx + (right.sx - left.sx) * t,
    sy: left.sy + (right.sy - left.sy) * t,
  };
}

function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

function sparklineStats(values: number[]): SparklineStats | null {
  if (values.length === 0) return null;
  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  return { min, max, avg: sum / values.length };
}

function formatDeltaHint(deltaSeconds: number | null): DeltaHint {
  if (deltaSeconds === null || !Number.isFinite(deltaSeconds)) {
    return {
      text: "Δ N/A",
      className: "text-muted border-[#4a4a5d] bg-[#171823]",
    };
  }

  if (Math.abs(deltaSeconds) < 0.001) {
    return {
      text: "Δ 0.000s",
      className: "text-muted border-[#4a4a5d] bg-[#171823]",
    };
  }

  const ahead = deltaSeconds > 0;
  return {
    text: `${ahead ? "+" : ""}${deltaSeconds.toFixed(3)}s`,
    className: ahead
      ? "text-[#3fd35a] border-[#276d33] bg-[#112419]"
      : "text-[#ff8a8a] border-[#7a2d38] bg-[#2a1217]",
  };
}

export default function Telemetry() {
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const [activeMode, setActiveMode] = useState<"quali" | "race" | null>(null);
  const [isCardsAccordionOpen, setIsCardsAccordionOpen] = useState(true);
  const [isTrackDialogOpen, setIsTrackDialogOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 1023px)").matches,
  );

  const rawCardDensity = searchParams.get("card");
  const cardDensity: "compact" | "expanded" =
    rawCardDensity === "compact" || rawCardDensity === "expanded"
      ? rawCardDensity
      : isNarrowViewport
        ? "compact"
        : "expanded";
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);

  const [driverA, setDriverA] = useNumberParam("a", null);
  const [driverB, setDriverB] = useNumberParam("b", null);
  const [driverC, setDriverC] = useNumberParam("c", null);

  const [lapA, setLapA] = useNumberParam("la", null);
  const [lapB, setLapB] = useNumberParam("lb", null);
  const [lapC, setLapC] = useNumberParam("lc", null);

  // Backward-compatible shared lap. Individual lap selectors can override this.
  const [sharedLap, setSharedLap] = useNumberParam("lap", null);

  const [smoothParam, setSmooth] = useStringParam<"0" | "1">("smooth", "0");
  const smoothing = smoothParam === "1";

  const sessions = useSessions(meetingKey);
  const drivers = useDrivers(sessionKey);
  // Filter pit-out laps server-side to reduce bandwidth
  const laps = useLaps(sessionKey, undefined, false, { is_pit_out_lap: false });

  const selectedLapA = lapA ?? sharedLap;
  const selectedLapB = lapB ?? sharedLap;
  const selectedLapC = lapC ?? sharedLap;

  const dataA = useCarDataForLap(sessionKey, driverA, selectedLapA);
  const dataB = useCarDataForLap(sessionKey, driverB, selectedLapB);
  const dataC = useCarDataForLap(sessionKey, driverC, selectedLapC);
  const [hoveredDistM, setHoveredDistM] = useState<number | null>(null);

  const session = sessions.data?.find((s) => s.session_key === sessionKey);

  const driverByNumber = useMemo(
    () => new Map((drivers.data ?? []).map((d) => [d.driver_number, d])),
    [drivers.data],
  );

  const availableLaps = useMemo(() => {
    if (!laps.data) return [];
    return [...new Set(laps.data.map((l) => l.lap_number))]
      .sort((a, b) => a - b)
      .filter((lapNo) => lapNo > 0);
  }, [laps.data]);

  const lapsByDriver = useMemo(() => {
    const out = new Map<number, number[]>();
    for (const lap of laps.data ?? []) {
      if (lap.lap_duration === null) continue;
      const prev = out.get(lap.driver_number) ?? [];
      if (!prev.includes(lap.lap_number)) prev.push(lap.lap_number);
      out.set(lap.driver_number, prev);
    }
    for (const values of out.values()) values.sort((a, b) => a - b);
    return out;
  }, [laps.data]);

  const lapLookup = useMemo(() => {
    const out = new Map<string, Lap>();
    for (const lap of laps.data ?? []) {
      out.set(`${lap.driver_number}:${lap.lap_number}`, lap);
    }
    return out;
  }, [laps.data]);

  const trackOutlineA = useTrackOutline(
    sessionKey,
    driverA,
    session?.circuit_key ?? null,
    session?.circuit_short_name ?? null,
  );

  const bestLapByDriver = useMemo(() => {
    const out = new Map<number, number>();
    const bestDuration = new Map<number, number>();

    for (const lap of laps.data ?? []) {
      if (lap.lap_duration === null || lap.is_pit_out_lap) continue;
      const current = bestDuration.get(lap.driver_number);
      if (current === undefined || lap.lap_duration < current) {
        bestDuration.set(lap.driver_number, lap.lap_duration);
        out.set(lap.driver_number, lap.lap_number);
      }
    }

    return out;
  }, [laps.data]);

  const latestLapByDriver = useMemo(() => {
    const out = new Map<number, number>();
    for (const lap of laps.data ?? []) {
      if (lap.lap_duration === null) continue;
      const current = out.get(lap.driver_number);
      if (current === undefined || lap.lap_number > current) {
        out.set(lap.driver_number, lap.lap_number);
      }
    }
    return out;
  }, [laps.data]);

  const acr = useCallback(
    (num: number | null, fallback: string) =>
      (num !== null && driverByNumber.get(num)?.name_acronym) || fallback,
    [driverByNumber],
  );

  const colorFor = useCallback(
    (num: number | null, i: number) =>
      teamColor(
        num !== null ? driverByNumber.get(num)?.team_colour : undefined,
        SLOT_COLORS[i],
      ),
    [driverByNumber],
  );

  type SlotKey = "a" | "b" | "c";

  const setSlotLap = (slot: SlotKey, value: number | null) => {
    setActiveMode(null);
    if (slot === "a") setLapA(value);
    if (slot === "b") setLapB(value);
    if (slot === "c") setLapC(value);
  };

  const applyPresetLap = (slot: SlotKey, preset: "best" | "latest") => {
    const selectedDriver =
      slot === "a" ? driverA : slot === "b" ? driverB : driverC;
    if (selectedDriver === null) return;

    const candidate =
      preset === "best"
        ? bestLapByDriver.get(selectedDriver)
        : latestLapByDriver.get(selectedDriver);

    if (candidate !== undefined) setSlotLap(slot, candidate);
  };

  const applyBestToAll = () => {
    trackEvent("telemetry_mode_best_all");
    setActiveMode(null);
    if (driverA !== null) {
      const best = bestLapByDriver.get(driverA);
      if (best !== undefined) setLapA(best);
    }
    if (driverB !== null) {
      const best = bestLapByDriver.get(driverB);
      if (best !== undefined) setLapB(best);
    }
    if (driverC !== null) {
      const best = bestLapByDriver.get(driverC);
      if (best !== undefined) setLapC(best);
    }
  };

  const syncOtherLapsToA = () => {
    trackEvent("telemetry_mode_sync_to_a", {
      source_lap: selectedLapA ?? -1,
    });
    setActiveMode(null);
    if (selectedLapA === null) return;
    if (driverB !== null) setLapB(selectedLapA);
    if (driverC !== null) setLapC(selectedLapA);
  };

  const applyQualiMode = () => {
    trackEvent("telemetry_mode_quali");
    setActiveMode("quali");
    setSharedLap(null);
    setSmooth("1");
    applyBestToAll();
  };

  const applyRaceMode = () => {
    trackEvent("telemetry_mode_race");
    setActiveMode("race");
    setSharedLap(null);
    setSmooth("0");
    if (driverA !== null) {
      const latest = latestLapByDriver.get(driverA);
      if (latest !== undefined) setLapA(latest);
    }
    if (driverB !== null) {
      const latest = latestLapByDriver.get(driverB);
      if (latest !== undefined) setLapB(latest);
    }
    if (driverC !== null) {
      const latest = latestLapByDriver.get(driverC);
      if (latest !== undefined) setLapC(latest);
    }
  };

  const getLapMeta = useCallback(
    (driver: number | null, lapNo: number | null): LapMeta => {
      if (driver === null || lapNo === null) {
        return {
          timeText: "No lap selected",
          statusLabel: "Idle",
          statusClass: "text-muted border-[#444458] bg-[#171822]",
        };
      }

      const lap = lapLookup.get(`${driver}:${lapNo}`);
      if (!lap) {
        return {
          timeText: "No timing data",
          statusLabel: "Missing",
          statusClass: "text-[#f5d400] border-[#7e7422] bg-[#2a240f]",
        };
      }

      if (lap.is_pit_out_lap) {
        return {
          timeText: formatLapTime(lap.lap_duration),
          statusLabel: "Pit Out",
          statusClass: "text-[#f5a623] border-[#875d18] bg-[#2d1f0e]",
        };
      }

      if (lap.lap_duration === null) {
        return {
          timeText: "No timing data",
          statusLabel: "Invalid",
          statusClass: "text-[#f5d400] border-[#7e7422] bg-[#2a240f]",
        };
      }

      return {
        timeText: formatLapTime(lap.lap_duration),
        statusLabel: "Valid",
        statusClass: "text-[#39b54a] border-[#276d33] bg-[#112419]",
      };
    },
    [lapLookup],
  );

  const lapMetaA = useMemo(
    () => getLapMeta(driverA, selectedLapA),
    [driverA, selectedLapA, getLapMeta],
  );
  const lapMetaB = useMemo(
    () => getLapMeta(driverB, selectedLapB),
    [driverB, selectedLapB, getLapMeta],
  );

  // Reference axis = driver A; B and C are resampled onto it.
  const dataBResampled = useMemo(
    () =>
      dataA.data && dataB.data ? resampleToAxis(dataA.data, dataB.data) : null,
    [dataA.data, dataB.data],
  );

  const dataCResampled = useMemo(
    () =>
      dataA.data && dataC.data ? resampleToAxis(dataA.data, dataC.data) : null,
    [dataA.data, dataC.data],
  );

  const xDist = useMemo(
    () => dataA.data?.map((s) => s.distM) ?? [],
    [dataA.data],
  );

  const trackPreview = useMemo(() => {
    const outline = trackOutlineA.data;
    if (!outline || outline.points.length < 2) return null;

    const { points: outlinePoints, bounds } = outline;
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
      return null;
    }

    let dist = 0;
    const points: TrackPreviewPoint[] = outlinePoints.map((point, idx) => {
      if (idx > 0) {
        const prev = outlinePoints[idx - 1]!;
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        dist += Math.hypot(dx, dy);
      }

      const { sx, sy } = locationToSvg(
        point.x,
        point.y,
        bounds,
        TRACK_SVG_W,
        TRACK_SVG_H,
      );

      return { sx, sy, dist };
    });

    const polyline = points
      .map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`)
      .join(" ");
    return {
      points,
      polyline,
      totalDist: points[points.length - 1]!.dist,
      rotationDeg: computeTrackAutoRotationDeg(outlinePoints, true),
    };
  }, [trackOutlineA.data]);

  // For a given set of raw samples, find the interpolated telemetry at a given timeS
  const sampleAtTimeS = useCallback(
    (rawSamples: TelemetrySample[], timeS: number): TelemetrySample | null => {
      if (rawSamples.length === 0) return null;
      const last = rawSamples[rawSamples.length - 1]!;
      if (timeS >= last.timeS) return last;
      const first = rawSamples[0]!;
      if (timeS <= first.timeS) return first;
      let lo = 0;
      let hi = rawSamples.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rawSamples[mid]!.timeS < timeS) lo = mid + 1;
        else hi = mid;
      }
      const right = rawSamples[lo]!;
      const left = rawSamples[Math.max(0, lo - 1)]!;
      const span = Math.max(1e-6, right.timeS - left.timeS);
      const alpha = Math.max(0, Math.min(1, (timeS - left.timeS) / span));
      const lerp = (a: number, b: number) => a + (b - a) * alpha;
      return {
        distM: lerp(left.distM, right.distM),
        timeS: lerp(left.timeS, right.timeS),
        speed: lerp(left.speed, right.speed),
        throttle: lerp(left.throttle, right.throttle),
        brake: lerp(left.brake, right.brake),
        rpm: lerp(left.rpm, right.rpm),
        gear: Math.round(lerp(left.gear, right.gear)),
        drs: lerp(left.drs, right.drs),
      };
    },
    [],
  );

  // Dialog-specific hover: driven by mouse position on the large SVG
  const [dialogHoveredDistM, setDialogHoveredDistM] = useState<number>(0);

  // Returns the distM on the track outline closest to an SVG (x,y) point,
  // accounting for the rotation transform applied to the track group.
  const nearestTrackDistM = useCallback(
    (svgX: number, svgY: number, rotDeg: number, svgW: number, svgH: number, points: TrackPreviewPoint[]): number | null => {
      if (points.length === 0) return null;
      // Rotate the mouse point into the track's coordinate space (inverse rotation)
      const cx = svgW / 2;
      const cy = svgH / 2;
      const rad = (-rotDeg * Math.PI) / 180;
      const dx = svgX - cx;
      const dy = svgY - cy;
      const rx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
      let best = 0;
      let bestDist2 = Infinity;
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const d2 = (p.sx - rx) ** 2 + (p.sy - ry) ** 2;
        if (d2 < bestDist2) { bestDist2 = d2; best = i; }
      }
      return points[best]!.dist;
    },
    [],
  );

  // that corresponds to hoveredDistM on Driver A's timeline, then return that
  // driver's distM at that moment so their track dot is placed correctly.
  const distMForDriverAtSameTime = useCallback(
    (rawSamples: TelemetrySample[], timeS: number): number => {
      if (rawSamples.length === 0) return 0;
      const last = rawSamples[rawSamples.length - 1]!;
      if (timeS >= last.timeS) return last.distM;
      if (timeS <= rawSamples[0]!.timeS) return rawSamples[0]!.distM;
      let lo = 0;
      let hi = rawSamples.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rawSamples[mid]!.timeS < timeS) lo = mid + 1;
        else hi = mid;
      }
      const right = rawSamples[lo]!;
      const left = rawSamples[Math.max(0, lo - 1)]!;
      const span = Math.max(1e-6, right.timeS - left.timeS);
      const alpha = Math.max(0, Math.min(1, (timeS - left.timeS) / span));
      return left.distM + (right.distM - left.distM) * alpha;
    },
    [],
  );

  // For a given set of raw samples, find timeS at Driver A's hovered distM.
  const timeSForDistM = useCallback(
    (rawSamples: TelemetrySample[], targetDistM: number): number | null => {
      if (rawSamples.length === 0) return null;
      const last = rawSamples[rawSamples.length - 1]!;
      if (targetDistM >= last.distM) return last.timeS;
      if (targetDistM <= rawSamples[0]!.distM) return rawSamples[0]!.timeS;
      let lo = 0;
      let hi = rawSamples.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rawSamples[mid]!.distM < targetDistM) lo = mid + 1;
        else hi = mid;
      }
      const right = rawSamples[lo]!;
      const left = rawSamples[Math.max(0, lo - 1)]!;
      const span = Math.max(1e-6, right.distM - left.distM);
      const alpha = Math.max(0, Math.min(1, (targetDistM - left.distM) / span));
      return left.timeS + (right.timeS - left.timeS) * alpha;
    },
    [],
  );

  // Build markers for a given distM on Driver A's axis, returning full telemetry per driver
  const buildTrackMarkers = useCallback(
    (distM: number): TrackMarker[] => {
      if (!trackPreview || xDist.length < 2) return [];
      const timeSAtHover = dataA.data
        ? timeSForDistM(dataA.data, distM)
        : null;
      if (timeSAtHover === null) return [];

      const markers: TrackMarker[] = [];
      const driverEntries = [
        driverA !== null ? { driver: driverA, color: colorFor(driverA, 0), rawData: dataA.data, lapNo: selectedLapA } : null,
        driverB !== null ? { driver: driverB, color: colorFor(driverB, 1), rawData: dataB.data, lapNo: selectedLapB } : null,
        driverC !== null ? { driver: driverC, color: colorFor(driverC, 2), rawData: dataC.data, lapNo: selectedLapC } : null,
      ].filter(Boolean) as Array<{ driver: number; color: string; rawData: TelemetrySample[] | undefined; lapNo: number | null }>;

      for (const entry of driverEntries) {
        if (!entry.rawData?.length) continue;
        const driverDistM = distMForDriverAtSameTime(entry.rawData, timeSAtHover);
        const driverLapMaxDist = entry.rawData[entry.rawData.length - 1]!.distM;
        if (driverLapMaxDist <= 0) continue;
        const progress = Math.max(0, Math.min(1, driverDistM / driverLapMaxDist));
        const point = interpolateTrackPoint(trackPreview.points, progress * trackPreview.totalDist);
        if (!point) continue;
        const sample = sampleAtTimeS(entry.rawData, timeSAtHover);
        const lap = entry.lapNo !== null ? lapLookup.get(`${entry.driver}:${entry.lapNo}`) : undefined;
        markers.push({
          driver: entry.driver,
          sx: point.sx,
          sy: point.sy,
          color: entry.color,
          label: acr(entry.driver, String(entry.driver).slice(-1) || "D"),
          speed: sample?.speed ?? 0,
          throttle: sample?.throttle ?? 0,
          brake: sample?.brake ?? 0,
          gear: sample?.gear ?? 0,
          drs: sample?.drs ?? 0,
          distM: driverDistM,
          timeS: timeSAtHover,
          s1: lap?.duration_sector_1 ?? null,
          s2: lap?.duration_sector_2 ?? null,
          s3: lap?.duration_sector_3 ?? null,
          i1: lap?.i1_speed ?? null,
          i2: lap?.i2_speed ?? null,
          st: lap?.st_speed ?? null,
          seg1: lap?.segments_sector_1 ?? null,
          seg2: lap?.segments_sector_2 ?? null,
          seg3: lap?.segments_sector_3 ?? null,
        });
      }
      return markers;
    },
    [trackPreview, xDist, dataA.data, dataB.data, dataC.data, driverA, driverB, driverC, colorFor, acr, timeSForDistM, distMForDriverAtSameTime, sampleAtTimeS, selectedLapA, selectedLapB, selectedLapC, lapLookup],
  );

  const hoveredTrackPoints = useMemo(
    () => (hoveredDistM !== null ? buildTrackMarkers(hoveredDistM) : []),
    [hoveredDistM, buildTrackMarkers],
  );

  const dialogTrackMarkers = useMemo(
    () => buildTrackMarkers(dialogHoveredDistM),
    [dialogHoveredDistM, buildTrackMarkers],
  );

  const handleChartHoverX = useCallback((value: number | null) => {
    setHoveredDistM((prev) => {
      if (prev === value) return prev;
      if (prev !== null && value !== null && Math.abs(prev - value) < 0.5) {
        return prev;
      }
      return value;
    });
  }, []);

  const plotSlots = useMemo<PlotSlot[]>(() => {
    const out: PlotSlot[] = [];

    if (dataA.data?.length)
      out.push({
        num: driverA!,
        label: acr(driverA, "A"),
        color: colorFor(driverA, 0),
        data: dataA.data,
      });

    if (driverB && dataBResampled?.length)
      out.push({
        num: driverB,
        label: acr(driverB, "B"),
        color: colorFor(driverB, 1),
        data: dataBResampled,
      });

    if (driverC && dataCResampled?.length)
      out.push({
        num: driverC,
        label: acr(driverC, "C"),
        color: colorFor(driverC, 2),
        data: dataCResampled,
      });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataA.data,
    dataBResampled,
    dataCResampled,
    driverA,
    driverB,
    driverC,
    driverByNumber,
  ]);

  const series = useCallback(
    (
      key: keyof Omit<TelemetrySample, "distM" | "timeS">,
      smoothable: boolean,
      withFill = false,
    ) => {
      return plotSlots.map((s) => {
        const raw = s.data.map((d) => d[key] as number);
        return {
          label: s.label,
          color: s.color,
          fill: withFill ? `${s.color}26` : undefined,
          data: smoothing && smoothable ? smooth(raw) : raw,
        };
      });
    },
    [plotSlots, smoothing],
  );

  const speedSeries = useMemo(() => {
    const base = series("speed", true);
    return base.map((s) => ({
      ...s,
      data: s.data.map((value) => toDisplaySpeed(value, metricSystem)),
    }));
  }, [series, metricSystem]);
  const throttleSeries = useMemo(
    () => series("throttle", true, true),
    [series],
  );
  const brakeSeries = useMemo(() => series("brake", true, true), [series]);
  const gearSeries = useMemo(() => series("gear", false), [series]);
  const rpmSeries = useMemo(() => series("rpm", true), [series]);
  const speedUnit = speedUnitLabel(metricSystem);
  const speedChartMax = metricSystem === "imperial" ? 240 : 380;
  const distanceUnit = metricSystem === "imperial" ? "mi" : "m";
  const distanceScale = metricSystem === "imperial" ? 0.000621371 : 1;

  const deltaSeries = useMemo(() => {
    if (!dataA.data) return [];
    const out: {
      label: string;
      color: string;
      fill?: string;
      data: number[];
    }[] = [];

    if (driverB && dataBResampled)
      out.push({
        label: acr(driverB, "B"),
        color: colorFor(driverB, 1),
        data: computeDelta(dataA.data, dataBResampled),
      });

    if (driverC && dataCResampled)
      out.push({
        label: acr(driverC, "C"),
        color: colorFor(driverC, 2),
        data: computeDelta(dataA.data, dataCResampled),
      });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataA.data,
    dataBResampled,
    dataCResampled,
    driverB,
    driverC,
    driverByNumber,
  ]);

  const finishDeltaB = useMemo(() => {
    if (!dataA.data || !dataBResampled) return null;
    const values = computeDelta(dataA.data, dataBResampled);
    return values.length ? (values[values.length - 1] ?? null) : null;
  }, [dataA.data, dataBResampled]);

  const deltaHintA = useMemo<DeltaHint>(
    () => ({
      text: "Reference",
      className: "text-[#9bc9ff] border-[#385b8a] bg-[#172437]",
    }),
    [],
  );

  const deltaHintB = useMemo(
    () => formatDeltaHint(finishDeltaB),
    [finishDeltaB],
  );
  const splitRows = useMemo(() => {
    const slots = [
      { num: driverA, lapNo: selectedLapA, index: 0 },
      { num: driverB, lapNo: selectedLapB, index: 1 },
      { num: driverC, lapNo: selectedLapC, index: 2 },
    ];

    const rows = slots.flatMap(({ num, lapNo, index }) => {
      if (num === null || lapNo === null) return [];
      const lap = lapLookup.get(`${num}:${lapNo}`);
      if (!lap) return [];

      return [
        {
          num,
          lapNo,
          color: colorFor(num, index),
          acr: acr(num, String(num)),
          s1: lap.duration_sector_1,
          s2: lap.duration_sector_2,
          s3: lap.duration_sector_3,
          lap: lap.lap_duration,
          i1: lap.i1_speed,
          i2: lap.i2_speed,
          st: lap.st_speed,
        },
      ];
    });

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    driverA,
    driverB,
    driverC,
    selectedLapA,
    selectedLapB,
    selectedLapC,
    lapLookup,
    driverByNumber,
  ]);

  const fastest = useMemo(() => {
    const min = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v !== null);
      return nums.length ? Math.min(...nums) : null;
    };

    const max = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v !== null);
      return nums.length ? Math.max(...nums) : null;
    };

    return {
      s1: min(splitRows.map((r) => r.s1)),
      s2: min(splitRows.map((r) => r.s2)),
      s3: min(splitRows.map((r) => r.s3)),
      lap: min(splitRows.map((r) => r.lap)),
      i1: max(splitRows.map((r) => r.i1)),
      i2: max(splitRows.map((r) => r.i2)),
      st: max(splitRows.map((r) => r.st)),
    };
  }, [splitRows]);

  const sectorWinsByDriver = useMemo(() => {
    const wins = new Map<number, SectorWins>();

    for (const row of splitRows) {
      wins.set(row.num, { ...EMPTY_SECTOR_WINS });
    }

    const assign = (key: "s1" | "s2" | "s3") => {
      const best = fastest[key];
      if (best === null) return;

      for (const row of splitRows) {
        if (row[key] !== best) continue;
        const prev = wins.get(row.num) ?? { ...EMPTY_SECTOR_WINS };
        if (!prev[key]) {
          prev[key] = true;
          prev.total += 1;
        }
        wins.set(row.num, prev);
      }
    };

    assign("s1");
    assign("s2");
    assign("s3");

    return wins;
  }, [fastest, splitRows]);

  const isLoading =
    (dataA.isPending && driverA !== null) ||
    (dataB.isPending && driverB !== null) ||
    (dataC.isPending && driverC !== null);
  const isLoadingEventSession =
    meetingKey !== null &&
    (sessionKey === null ||
      sessions.isPending ||
      (sessionKey !== null && (drivers.isPending || laps.isPending)));

  const hasError = dataA.isError || dataB.isError || dataC.isError;

  const noTelemetry =
    driverA !== null &&
    selectedLapA !== null &&
    !dataA.isPending &&
    !dataA.isError &&
    (dataA.data == null || dataA.data.length === 0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };

    setIsNarrowViewport(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // When the session changes (driven by the global Nav picker), clear local state.
  useEffect(() => {
    setActiveMode(null);
    setDriverA(null);
    setDriverB(null);
    setDriverC(null);

    setLapA(null);
    setLapB(null);
    setLapC(null);
    setSharedLap(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // If a driver is removed, clear only their lap override.
  useEffect(() => {
    if (driverA === null) setLapA(null);
    if (driverB === null) setLapB(null);
    if (driverC === null) setLapC(null);
  }, [driverA, driverB, driverC, setLapA, setLapB, setLapC]);

  return (
    <div className="relative flex flex-col md:h-full md:overflow-hidden">
      {isLoadingEventSession && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded border border-panel bg-surface px-4 py-4 text-center shadow-2xl">
            <div className="text-f1red text-[11px] font-black uppercase tracking-[0.16em] animate-pulse">
              Loading Event
            </div>
            <div className="mt-2 text-xs text-muted">
              Fetching sessions and loading telemetry context.
            </div>
          </div>
        </div>
      )}

      <div
        className={`px-3 py-3 ${
          lightMode
            ? "bg-[radial-gradient(circle_at_top_left,#edf1fb_0%,#e8edf8_40%,#e3e9f6_100%)]"
            : "bg-[radial-gradient(circle_at_top_left,#2a2136_0%,#1b1d28_40%,#16161f_100%)]"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={applyBestToAll}
            className="h-[34px] border border-panel bg-track px-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-f1red"
            title="Pick each selected driver's best recorded lap"
          >
            Best all
          </button>

          <button
            onClick={syncOtherLapsToA}
            className="h-[34px] border border-panel bg-track px-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-f1red"
            title="Use Driver A lap number for Driver B and Driver C"
          >
            Sync to A
          </button>

          <button
            onClick={applyQualiMode}
            className={`h-[34px] border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeMode === "quali"
                ? "border-[#cb9dff] bg-[#3b2350] text-white shadow-[0_0_0_1px_rgba(203,157,255,0.35),0_0_24px_rgba(155,89,245,0.35)]"
                : "border-[#63407a] bg-[#23152d] text-[#dcc3ff] hover:border-[#a569d8]"
            }`}
            title="Quali mode: best laps + smoothing"
          >
            Quali mode
          </button>

          <button
            onClick={applyRaceMode}
            className={`h-[34px] border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeMode === "race"
                ? "border-[#9bc9ff] bg-[#1a2639] text-white shadow-[0_0_0_1px_rgba(155,201,255,0.35),0_0_24px_rgba(0,103,255,0.3)]"
                : "border-panel bg-track text-white hover:border-[#95b7ff]"
            }`}
            title="Race mode: latest laps + raw traces"
          >
            Race mode
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className={LABEL}>Shared lap</span>
            <select
              value={sharedLap ?? ""}
              onChange={(e) => {
                const nextSharedLap = Number(e.target.value) || null;
                setActiveMode(null);
                setSharedLap(nextSharedLap);
                trackEvent("telemetry_shared_lap_changed", {
                  lap_number: nextSharedLap ?? -1,
                });
              }}
              disabled={!driverA}
              className={`${SELECT} min-w-[120px]`}
            >
              <option value="">None</option>
              {availableLaps.map((n) => (
                <option key={n} value={n}>
                  Lap {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            Driver & track preview
          </span>
          <button
            type="button"
            onClick={() => {
              setIsCardsAccordionOpen((open) => {
                const nextValue = !open;
                trackEvent("telemetry_cards_toggled", {
                  expanded: nextValue,
                });
                return nextValue;
              });
            }}
            className="h-7 border border-panel bg-track px-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-[#95b7ff]"
            aria-expanded={isCardsAccordionOpen}
            title={
              isCardsAccordionOpen
                ? "Collapse preview cards"
                : "Expand preview cards"
            }
          >
            {isCardsAccordionOpen ? "Hide" : "Show"}
          </button>
        </div>

        {isCardsAccordionOpen && (() => {
          const TrackSvg = (
            <svg
              viewBox={`0 0 ${TRACK_SVG_W} ${TRACK_SVG_H}`}
              className="relative h-full w-full"
              role="img"
              aria-label="Lap track preview"
            >
              <g
                transform={`rotate(${trackPreview?.rotationDeg.toFixed(1) ?? "0"} ${(TRACK_SVG_W / 2).toFixed(1)} ${(TRACK_SVG_H / 2).toFixed(1)})`}
              >
                {trackPreview && (
                  <>
                    <polyline
                      points={trackPreview.polyline}
                      fill="none"
                      stroke="#3e4a64"
                      strokeWidth={5.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.7}
                    />
                    <polyline
                      points={trackPreview.polyline}
                      fill="none"
                      stroke="#d7deee"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
                {hoveredTrackPoints.length > 0 && (
                  <>
                    {hoveredTrackPoints.length > 1 &&
                      hoveredTrackPoints.slice(1).map((marker, idx) => {
                        const prev = hoveredTrackPoints[idx]!;
                        const dx = marker.sx - prev.sx;
                        const dy = marker.sy - prev.sy;
                        const dist = Math.hypot(dx, dy);
                        if (dist < 3) return null;
                        return (
                          <line
                            key={`connector-${marker.driver}`}
                            x1={prev.sx}
                            y1={prev.sy}
                            x2={marker.sx}
                            y2={marker.sy}
                            stroke="rgba(255,255,255,0.25)"
                            strokeWidth={1}
                            strokeDasharray="2 2"
                          />
                        );
                      })}
                    {hoveredTrackPoints.map((marker) => {
                      const cx = TRACK_SVG_W / 2;
                      const cy = TRACK_SVG_H / 2;
                      const dx = marker.sx - cx;
                      const dy = marker.sy - cy;
                      const len = Math.hypot(dx, dy) || 1;
                      const tagX = marker.sx + (dx / len) * 13;
                      const tagY = marker.sy + (dy / len) * 13;
                      const textAnchor =
                        tagX < marker.sx
                          ? "end"
                          : tagX > marker.sx
                            ? "start"
                            : "middle";
                      return (
                        <g key={`hover-${marker.driver}`}>
                          <circle cx={marker.sx} cy={marker.sy} r={10} fill={marker.color} opacity={0.22} />
                          <circle cx={marker.sx} cy={marker.sy} r={5} fill={marker.color} stroke="#15151e" strokeWidth={1.5} />
                          <text x={tagX} y={tagY + 2.5} fill={marker.color} fontSize={6.5} fontWeight={800} letterSpacing={0.4} textAnchor={textAnchor} style={{ paintOrder: "stroke" }} stroke="#15151e" strokeWidth={2.5} strokeLinejoin="round">{marker.label}</text>
                          <text x={tagX} y={tagY + 2.5} fill={marker.color} fontSize={6.5} fontWeight={800} letterSpacing={0.4} textAnchor={textAnchor}>{marker.label}</text>
                        </g>
                      );
                    })}
                  </>
                )}
              </g>
            </svg>
          );

          return (
          <>
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-3">
            <DriverLapCard
              slotLabel="Driver A"
              accent={colorFor(driverA, 0)}
              driverTag={acr(driverA, "A")}
              driverName={
                driverA !== null
                  ? (driverByNumber.get(driverA)?.full_name ??
                    acr(driverA, "A"))
                  : "Unselected"
              }
              driverHeadshotUrl={
                driverA !== null
                  ? (driverByNumber.get(driverA)?.headshot_url ?? null)
                  : null
              }
              driver={driverA}
              onDriverChange={(value) => {
                setDriverA(value);
                trackEvent("telemetry_driver_changed", {
                  slot: "a",
                  driver_number: value ?? -1,
                });
              }}
              driverOptions={drivers.data ?? []}
              driverPlaceholder="Select anchor"
              lap={selectedLapA}
              lapOptions={
                driverA !== null ? (lapsByDriver.get(driverA) ?? []) : []
              }
              onLapChange={(value) => {
                setLapA(value);
                trackEvent("telemetry_lap_changed", {
                  slot: "a",
                  lap_number: value ?? -1,
                });
              }}
              onBest={() => {
                trackEvent("telemetry_lap_preset", {
                  slot: "a",
                  preset: "best",
                });
                applyPresetLap("a", "best");
              }}
              onLatest={() => {
                trackEvent("telemetry_lap_preset", {
                  slot: "a",
                  preset: "latest",
                });
                applyPresetLap("a", "latest");
              }}
              bestLap={
                driverA !== null ? (bestLapByDriver.get(driverA) ?? null) : null
              }
              latestLap={
                driverA !== null
                  ? (latestLapByDriver.get(driverA) ?? null)
                  : null
              }
              lapMeta={lapMetaA}
              speedTrace={dataA.data?.map((sample) => sample.speed) ?? []}
              deltaHint={deltaHintA}
              sectorWins={
                driverA !== null
                  ? (sectorWinsByDriver.get(driverA) ?? EMPTY_SECTOR_WINS)
                  : EMPTY_SECTOR_WINS
              }
              sectorAnimationSeed={selectedLapA}
              compact={cardDensity === "compact"}
              disabled={!sessionKey}
            />

            <DriverLapCard
              slotLabel="Driver B"
              accent={colorFor(driverB, 1)}
              driverTag={acr(driverB, "B")}
              driverName={
                driverB !== null
                  ? (driverByNumber.get(driverB)?.full_name ??
                    acr(driverB, "B"))
                  : "Unselected"
              }
              driverHeadshotUrl={
                driverB !== null
                  ? (driverByNumber.get(driverB)?.headshot_url ?? null)
                  : null
              }
              driver={driverB}
              onDriverChange={(value) => {
                setDriverB(value);
                trackEvent("telemetry_driver_changed", {
                  slot: "b",
                  driver_number: value ?? -1,
                });
              }}
              driverOptions={(drivers.data ?? []).filter(
                (d) =>
                  d.driver_number !== driverA && d.driver_number !== driverC,
              )}
              driverPlaceholder="Optional"
              lap={selectedLapB}
              lapOptions={
                driverB !== null ? (lapsByDriver.get(driverB) ?? []) : []
              }
              onLapChange={(value) => {
                setLapB(value);
                trackEvent("telemetry_lap_changed", {
                  slot: "b",
                  lap_number: value ?? -1,
                });
              }}
              onBest={() => {
                trackEvent("telemetry_lap_preset", {
                  slot: "b",
                  preset: "best",
                });
                applyPresetLap("b", "best");
              }}
              onLatest={() => {
                trackEvent("telemetry_lap_preset", {
                  slot: "b",
                  preset: "latest",
                });
                applyPresetLap("b", "latest");
              }}
              bestLap={
                driverB !== null ? (bestLapByDriver.get(driverB) ?? null) : null
              }
              latestLap={
                driverB !== null
                  ? (latestLapByDriver.get(driverB) ?? null)
                  : null
              }
              lapMeta={lapMetaB}
              speedTrace={dataB.data?.map((sample) => sample.speed) ?? []}
              deltaHint={deltaHintB}
              sectorWins={
                driverB !== null
                  ? (sectorWinsByDriver.get(driverB) ?? EMPTY_SECTOR_WINS)
                  : EMPTY_SECTOR_WINS
              }
              sectorAnimationSeed={selectedLapB}
              compact={cardDensity === "compact"}
              disabled={!sessionKey}
            />

            <div className="h-full lg:h-[248px] rounded border border-panel bg-track p-1.5 flex flex-col">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">
                  Track position preview
                </span>
                <span className="h-1.5 w-8 rounded-full bg-f1red" />
                <button
                  type="button"
                  onClick={() => setIsTrackDialogOpen((v) => !v)}
                  className="ml-auto h-5 border border-panel bg-track px-2 text-[9px] font-black uppercase tracking-widest text-muted transition-colors hover:border-f1red hover:text-white"
                  title={isTrackDialogOpen ? "Close track dialog" : "Expand track"}
                >
                  {isTrackDialogOpen ? "✕ Close" : "↗ Expand"}
                </button>
              </div>

              {trackPreview ? (
                <div className="relative min-h-[112px] flex-1 overflow-hidden rounded border border-panel bg-track">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(39,68,158,0.2),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(232,0,45,0.1),transparent_40%)]" />
                  {TrackSvg}
                </div>
              ) : (
                <div className="flex min-h-[112px] flex-1 items-center justify-center rounded border border-panel bg-track px-3 text-center text-xs text-muted">
                  Select Driver A and a valid lap to draw the track.
                </div>
              )}
            </div>
          </div>

          {/* Track dialog — full-screen modal with interactive hover */}
          {isTrackDialogOpen && trackPreview && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={(e) => { if (e.target === e.currentTarget) setIsTrackDialogOpen(false); }}
            >
              <div className="relative flex w-full max-w-5xl flex-col gap-3 rounded border border-panel bg-[#15151e] p-4 shadow-2xl mx-4" style={{ maxHeight: "90vh" }}>
                {/* Dialog header */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">
                    Track position preview
                  </span>
                  <span className="h-1.5 w-8 rounded-full bg-f1red" />
                  {session && (
                    <span className="ml-2 text-[10px] text-muted">
                      {session.circuit_short_name} · {session.session_name} · {session.year}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsTrackDialogOpen(false)}
                    className="ml-auto flex h-7 w-7 items-center justify-center border border-panel bg-track text-sm text-muted transition-colors hover:border-f1red hover:text-white"
                    aria-label="Close dialog"
                  >
                    ✕
                  </button>
                </div>

                {/* Track SVG — interactive */}
                <div className="relative overflow-hidden rounded border border-panel bg-track" style={{ height: 440 }}>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(39,68,158,0.2),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(232,0,45,0.1),transparent_40%)]" />
                  <svg
                    viewBox={`0 0 ${TRACK_SVG_W} ${TRACK_SVG_H}`}
                    className="relative h-full w-full cursor-crosshair"
                    role="img"
                    aria-label="Interactive lap track preview"
                    onMouseMove={(e) => {
                      const svg = e.currentTarget;
                      const rect = svg.getBoundingClientRect();
                      const scaleX = TRACK_SVG_W / rect.width;
                      const scaleY = TRACK_SVG_H / rect.height;
                      const svgX = (e.clientX - rect.left) * scaleX;
                      const svgY = (e.clientY - rect.top) * scaleY;
                      const trackDist = nearestTrackDistM(svgX, svgY, trackPreview.rotationDeg, TRACK_SVG_W, TRACK_SVG_H, trackPreview.points);
                      if (trackDist === null || !dataA.data?.length) return;
                      // Convert track outline dist back to Driver A's distM axis
                      const driverAMaxDist = dataA.data[dataA.data.length - 1]!.distM;
                      const progress = trackDist / trackPreview.totalDist;
                      setDialogHoveredDistM(progress * driverAMaxDist);
                    }}
                    onMouseLeave={() => { /* keep last position */ }}
                  >
                    <g transform={`rotate(${trackPreview.rotationDeg.toFixed(1)} ${(TRACK_SVG_W / 2).toFixed(1)} ${(TRACK_SVG_H / 2).toFixed(1)})`}>
                      <polyline points={trackPreview.polyline} fill="none" stroke="#3e4a64" strokeWidth={5.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                      <polyline points={trackPreview.polyline} fill="none" stroke="#d7deee" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      {dialogTrackMarkers.length > 1 &&
                        dialogTrackMarkers.slice(1).map((marker, idx) => {
                          const prev = dialogTrackMarkers[idx]!;
                          const dx = marker.sx - prev.sx;
                          const dy = marker.sy - prev.sy;
                          if (Math.hypot(dx, dy) < 3) return null;
                          return (
                            <line key={`dlg-conn-${marker.driver}`} x1={prev.sx} y1={prev.sy} x2={marker.sx} y2={marker.sy} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="2 2" />
                          );
                        })}
                      {dialogTrackMarkers.map((marker) => {
                        const cx = TRACK_SVG_W / 2;
                        const cy = TRACK_SVG_H / 2;
                        const dx = marker.sx - cx;
                        const dy = marker.sy - cy;
                        const len = Math.hypot(dx, dy) || 1;
                        const tagX = marker.sx + (dx / len) * 14;
                        const tagY = marker.sy + (dy / len) * 14;
                        const textAnchor = tagX < marker.sx ? "end" : tagX > marker.sx ? "start" : "middle";
                        return (
                          <g key={`dlg-${marker.driver}`}>
                            <circle cx={marker.sx} cy={marker.sy} r={10} fill={marker.color} opacity={0.22} />
                            <circle cx={marker.sx} cy={marker.sy} r={5} fill={marker.color} stroke="#15151e" strokeWidth={1.5} />
                            <text x={tagX} y={tagY + 2.5} fill={marker.color} fontSize={6.5} fontWeight={800} letterSpacing={0.4} textAnchor={textAnchor} stroke="#15151e" strokeWidth={2.5} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>{marker.label}</text>
                            <text x={tagX} y={tagY + 2.5} fill={marker.color} fontSize={6.5} fontWeight={800} letterSpacing={0.4} textAnchor={textAnchor}>{marker.label}</text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  {dialogTrackMarkers.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                      <span className="text-[10px] text-muted">Move cursor over the track to inspect driver data</span>
                    </div>
                  )}
                </div>

                {/* Driver data cards — shown when hovering the dialog track */}
                {dialogTrackMarkers.length > 0 && (() => {
                  const minS1 = dialogTrackMarkers.reduce<number | null>((m, r) => r.s1 !== null && (m === null || r.s1 < m) ? r.s1 : m, null);
                  const minS2 = dialogTrackMarkers.reduce<number | null>((m, r) => r.s2 !== null && (m === null || r.s2 < m) ? r.s2 : m, null);
                  const minS3 = dialogTrackMarkers.reduce<number | null>((m, r) => r.s3 !== null && (m === null || r.s3 < m) ? r.s3 : m, null);
                  const sectorTier = (val: number | null, best: number | null): string => {
                    if (val === null) return "bg-panel";
                    if (best !== null && val === best) return "bg-[#9b59f5]";
                    return "bg-[#39b54a]";
                  };
                  const miniClass = (code: number): string => {
                    if (code >= 2064) return "bg-[#9b59f5]";
                    if (code === 2051) return "bg-[#f5d400]";
                    if (code >= 2049) return "bg-[#39b54a]";
                    if (code > 0) return "bg-white/35";
                    return "bg-panel";
                  };
                  return (
                    <div className="grid gap-2 shrink-0" style={{ gridTemplateColumns: `repeat(${dialogTrackMarkers.length}, minmax(0,1fr))` }}>
                      {dialogTrackMarkers.map((marker) => (
                        <div key={`dlg-data-${marker.driver}`} className="rounded border bg-track p-2.5" style={{ borderColor: `${marker.color}55` }}>
                          {/* Header: headshot + name + time */}
                          <div className="mb-2 flex items-center gap-2">
                            <DriverHeadshot
                              driver={driverByNumber.get(marker.driver)}
                              accent={marker.color}
                              size="xs"
                            />
                            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: marker.color }}>{marker.label}</span>
                            <span className="ml-auto font-mono text-[10px] text-muted">{formatLapTime(marker.timeS)}</span>
                          </div>

                          {/* Live telemetry */}
                          <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                            <div>
                              <div className="text-[9px] uppercase tracking-widest text-muted">Speed</div>
                              <div className="font-mono text-sm font-bold text-white">{toDisplaySpeed(marker.speed, metricSystem).toFixed(0)} <span className="text-[9px] text-muted">{speedUnitLabel(metricSystem)}</span></div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-widest text-muted">Gear</div>
                              <div className="font-mono text-sm font-bold text-white">{marker.gear}</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-widest text-muted">Throttle</div>
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 flex-1 rounded-full bg-panel overflow-hidden">
                                  <div className="h-full rounded-full bg-[#23c552]" style={{ width: `${marker.throttle}%` }} />
                                </div>
                                <span className="font-mono text-[10px] text-white w-7 text-right">{Math.round(marker.throttle)}%</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-widest text-muted">Brake</div>
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 flex-1 rounded-full bg-panel overflow-hidden">
                                  <div className="h-full rounded-full bg-[#e8002d]" style={{ width: `${marker.brake}%` }} />
                                </div>
                                <span className="font-mono text-[10px] text-white w-7 text-right">{Math.round(marker.brake)}%</span>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-[9px] uppercase tracking-widest text-muted">DRS</div>
                              <div className={`text-[10px] font-bold ${marker.drs > 10 ? "text-[#23c552]" : "text-muted"}`}>{marker.drs > 10 ? "Active" : "Closed"}</div>
                            </div>
                          </div>

                          {/* Sectors inline */}
                          <div className="border-t border-panel pt-2">
                            <div className="flex gap-2">
                              {(["s1", "s2", "s3"] as const).map((sk, si) => {
                                const dur = marker[sk];
                                const best = [minS1, minS2, minS3][si]!;
                                const segs = [marker.seg1, marker.seg2, marker.seg3][si];
                                const isFastest = dur !== null && best !== null && dur === best;
                                return (
                                  <div key={sk} className="flex-1 min-w-0">
                                    <div className="text-[8px] uppercase tracking-widest text-muted mb-0.5">S{si + 1}</div>
                                    {/* Sector bar + mini-segments */}
                                    <div className="flex flex-col gap-[2px] mb-1">
                                      <div className={`h-[5px] rounded-sm ${sectorTier(dur, best)}`} />
                                      {segs && segs.length > 0 && (
                                        <div className="flex h-[3px] gap-px overflow-hidden rounded-sm">
                                          {segs.map((code, idx) => (
                                            <div key={idx} className={`h-full flex-1 ${miniClass(code)}`} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className={`font-mono text-[9px] leading-none ${isFastest ? "text-[#9b59f5] font-bold" : "text-white"}`}>
                                      {dur !== null ? formatLapTime(dur) : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Speed traps */}
                            {(marker.i1 !== null || marker.i2 !== null || marker.st !== null) && (
                              <div className="mt-2 flex gap-3">
                                {marker.i1 !== null && (
                                  <div>
                                    <div className="text-[8px] uppercase tracking-widest text-muted">I1</div>
                                    <div className="font-mono text-[10px] text-white">{toDisplaySpeed(marker.i1, metricSystem).toFixed(0)}</div>
                                  </div>
                                )}
                                {marker.i2 !== null && (
                                  <div>
                                    <div className="text-[8px] uppercase tracking-widest text-muted">I2</div>
                                    <div className="font-mono text-[10px] text-white">{toDisplaySpeed(marker.i2, metricSystem).toFixed(0)}</div>
                                  </div>
                                )}
                                {marker.st !== null && (
                                  <div>
                                    <div className="text-[8px] uppercase tracking-widest text-muted">ST</div>
                                    <div className="font-mono text-[10px] text-white">{toDisplaySpeed(marker.st, metricSystem).toFixed(0)}</div>
                                  </div>
                                )}
                                <div className="self-end text-[8px] text-muted">{speedUnitLabel(metricSystem)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
          );
        })()}

        {session && (
          <span className="mt-1 block text-xs text-muted sm:ml-auto">
            {session.circuit_short_name} · {session.session_name} ·{" "}
            {session.year}
          </span>
        )}

        {isLoading && (
          <span className="mt-1 block text-xs text-f1red animate-pulse">
            Loading telemetry...
          </span>
        )}
      </div>

      <div
        className={`panel-scroll space-y-2 border-t border-panel px-3 pb-3 pt-1 ${
          lightMode ? "bg-[#edf1f9]" : "bg-track"
        }`}
      >
        {(() => {
          if (hasError) {
            return (
              <ErrorMessage message="Failed to load telemetry for a selected driver" />
            );
          }

          if (!driverA || !selectedLapA) {
            return (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Select Driver A and a lap to view telemetry
              </div>
            );
          }

          if (noTelemetry) {
            return (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                No telemetry available for this lap - try another lap or driver
              </div>
            );
          }

          return (
            <>
              <div className="mb-1 flex flex-wrap gap-5 text-xs">
                {plotSlots.map((s) => {
                  const lapForSlot =
                    s.num === driverA
                      ? selectedLapA
                      : s.num === driverB
                        ? selectedLapB
                        : selectedLapC;

                  return (
                    <span
                      key={`${s.num}-${lapForSlot ?? "na"}`}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className="inline-block h-0.5 w-6"
                        style={{ background: s.color }}
                      />
                      <span className="font-bold" style={{ color: s.color }}>
                        {s.label} · L{lapForSlot ?? "-"}
                      </span>
                    </span>
                  );
                })}
              </div>

              <SplitsTable rows={splitRows} fastest={fastest} />

              <TelemetryChart
                title={`Speed (${speedUnit})`}
                xData={xDist}
                yMin={0}
                yMax={speedChartMax}
                height={280}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit={speedUnit}
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={speedSeries}
              />
              <TelemetryChart
                title="Throttle (%)"
                xData={xDist}
                yMin={0}
                yMax={100}
                height={210}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="%"
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={throttleSeries}
              />
              <TelemetryChart
                title="Brake"
                xData={xDist}
                yMin={0}
                yMax={100}
                height={200}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="%"
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={brakeSeries}
              />
              <TelemetryChart
                title="Gear"
                xData={xDist}
                yMin={0}
                yMax={9}
                height={210}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="gear"
                legendDecimals={0}
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={gearSeries}
              />
              <TelemetryChart
                title="RPM"
                xData={xDist}
                yMin={0}
                yMax={15000}
                height={220}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="rpm"
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={rpmSeries}
              />

              {deltaSeries.length > 0 && (
                <div className={PANEL}>
                  <div className={PANEL_TITLE}>
                    Delta vs {acr(driverA, "A")}
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted">
                      (+ = {acr(driverA, "A")} ahead)
                    </span>
                  </div>
                  <TelemetryChart
                    title=""
                    xData={xDist}
                    height={220}
                    interactiveControls
                    onHoverX={handleChartHoverX}
                    legendUnit="s"
                    distanceUnit={distanceUnit}
                    distanceScale={distanceScale}
                    series={deltaSeries}
                  />
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function DriverSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: { driver_number: number; name_acronym: string; full_name: string }[];
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value) || null)}
        disabled={disabled}
        className={`${SELECT} min-w-0 w-full`}
      >
        <option value="">{placeholder}</option>
        {options.map((d) => (
          <option key={d.driver_number} value={d.driver_number}>
            {d.name_acronym} - {d.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DriverLapCard({
  slotLabel,
  accent,
  driverTag,
  driverName,
  driverHeadshotUrl,
  driver,
  onDriverChange,
  driverOptions,
  driverPlaceholder,
  lap,
  lapOptions,
  onLapChange,
  onBest,
  onLatest,
  bestLap,
  latestLap,
  lapMeta,
  speedTrace,
  deltaHint,
  sectorWins,
  sectorAnimationSeed,
  compact,
  disabled,
}: {
  slotLabel: string;
  accent: string;
  driverTag: string;
  driverName: string;
  driverHeadshotUrl: string | null;
  driver: number | null;
  onDriverChange: (value: number | null) => void;
  driverOptions: {
    driver_number: number;
    name_acronym: string;
    full_name: string;
  }[];
  driverPlaceholder: string;
  lap: number | null;
  lapOptions: number[];
  onLapChange: (value: number | null) => void;
  onBest: () => void;
  onLatest: () => void;
  bestLap: number | null;
  latestLap: number | null;
  lapMeta: LapMeta;
  speedTrace: number[];
  deltaHint: DeltaHint;
  sectorWins: SectorWins;
  sectorAnimationSeed: number | null;
  compact: boolean;
  disabled: boolean;
}) {
  const speedStats = useMemo(() => sparklineStats(speedTrace), [speedTrace]);
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const safeHeadshotUrl = toSafeExternalUrl(driverHeadshotUrl);

  useEffect(() => {
    setHeadshotFailed(false);
  }, [safeHeadshotUrl, driver]);

  const hasHeadshot = !!safeHeadshotUrl && !headshotFailed;
  const avatarLabel = driverTag.toUpperCase().slice(0, 3);
  const isBestSelected =
    lap !== null && bestLap !== null && Number(lap) === Number(bestLap);
  const isLatestSelected =
    lap !== null && latestLap !== null && Number(lap) === Number(latestLap);

  return (
    <div className="h-full lg:h-[248px] rounded border border-panel bg-track p-1.5">
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-panel bg-surface">
            {hasHeadshot ? (
              <img
                src={safeHeadshotUrl}
                alt={`${driverName} profile`}
                className="h-full w-full object-cover"
                onError={() => setHeadshotFailed(true)}
                loading="lazy"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                {avatarLabel}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.15em] text-muted">
              {slotLabel}
            </span>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className="truncate text-[11px] font-black uppercase tracking-[0.08em]"
                style={{ color: accent }}
                title={driverName}
              >
                {driverTag}
              </span>
              <span
                className="h-1.5 w-8 rounded-full"
                style={{ backgroundColor: accent }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <SectorChip
            label="S1"
            active={sectorWins.s1}
            animationSeed={sectorAnimationSeed}
          />
          <SectorChip
            label="S2"
            active={sectorWins.s2}
            animationSeed={sectorAnimationSeed}
          />
          <SectorChip
            label="S3"
            active={sectorWins.s3}
            animationSeed={sectorAnimationSeed}
          />
          <span
            key={`wins-${sectorAnimationSeed ?? "none"}-${sectorWins.total}`}
            className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${
              sectorWins.total > 0
                ? "border-[#5f4c7c] bg-[#251a35] text-[#d4b7ff] animate-[pulse_0.45s_ease-out_1]"
                : "border-panel bg-surface text-muted"
            }`}
            title="Total sector wins for selected lap"
          >
            W{sectorWins.total}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_108px]">
        <DriverSelect
          label="Driver"
          value={driver}
          onChange={onDriverChange}
          options={driverOptions}
          disabled={disabled}
          placeholder={driverPlaceholder}
        />

        <div className="flex min-w-0 flex-col gap-1">
          <span className={LABEL}>Lap</span>
          <select
            value={lap ?? ""}
            onChange={(e) => onLapChange(Number(e.target.value) || null)}
            disabled={disabled || driver === null}
            className={`${SELECT} min-w-0`}
          >
            <option value="">Select</option>
            {lapOptions.map((n) => (
              <option key={n} value={n}>
                Lap {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          onClick={onBest}
          disabled={driver === null || bestLap === null}
          className={`border px-2 font-bold uppercase tracking-[0.12em] disabled:opacity-50 ${
            compact ? "h-5 text-[9px]" : "h-6 text-[10px]"
          } ${
            isBestSelected
              ? "border-[#6f54a2] bg-[#2a1b3f] text-[#dfcbff]"
              : "border-panel bg-surface text-white"
          }`}
          title="Select best valid lap"
        >
          Best {bestLap !== null ? `L${bestLap}` : ""}
        </button>

        <button
          onClick={onLatest}
          disabled={driver === null || latestLap === null}
          className={`border px-2 font-bold uppercase tracking-[0.12em] disabled:opacity-50 ${
            compact ? "h-5 text-[9px]" : "h-6 text-[10px]"
          } ${
            isLatestSelected
              ? "border-[#2c6ab7] bg-[#112744] text-[#b9dcff]"
              : "border-panel bg-surface text-white"
          }`}
          title="Select latest valid lap"
        >
          Latest {latestLap !== null ? `L${latestLap}` : ""}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded border border-panel bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          {lapMeta.timeText}
        </span>
        <span
          className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${lapMeta.statusClass}`}
        >
          {lapMeta.statusLabel}
        </span>
        <span
          className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${deltaHint.className}`}
          title="Estimated lap-end delta versus Driver A"
        >
          {deltaHint.text}
        </span>
      </div>

      {!compact && (
        <div className="mt-1.5 overflow-hidden rounded border border-panel bg-surface">
          <div className="flex items-center justify-between border-b border-[#2d2d3b] px-2 py-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Speed trace
            </span>
            {speedStats && (
              <span className="text-[10px] font-semibold text-muted">
                AVG {Math.round(speedStats.avg)} · MAX{" "}
                {Math.round(speedStats.max)}
              </span>
            )}
          </div>
          <div className="px-2 py-1">
            <SpeedSparkline
              values={speedTrace}
              color={accent}
              driverTag={driverTag}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SectorChip({
  label,
  active,
  animationSeed,
}: {
  label: string;
  active: boolean;
  animationSeed: number | null;
}) {
  return (
    <span
      key={`${label}-${animationSeed ?? "none"}-${active ? 1 : 0}`}
      className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${
        active
          ? "border-[#6f54a2] bg-[#2a1b3f] text-[#dfcbff] animate-[pulse_0.45s_ease-out_1]"
          : "border-panel bg-surface text-muted"
      }`}
      title={active ? `${label} winner` : `${label} not quickest`}
    >
      {label}
    </span>
  );
}

function SpeedSparkline({
  values,
  color,
  driverTag,
}: {
  values: number[];
  color: string;
  driverTag: string;
}) {
  if (values.length < 2) {
    return (
      <div className="flex h-10 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        No trace
      </div>
    );
  }

  const width = 320;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const startY = height - ((values[0]! - min) / span) * height;
  const endY = height - ((values[values.length - 1]! - min) / span) * height;
  const tag = driverTag.toUpperCase().slice(0, 3);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-10 w-full"
      preserveAspectRatio="none"
      aria-label="Lap speed sparkline"
      role="img"
    >
      <polyline points={areaPoints} fill={`${color}22`} stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <circle cx={0} cy={startY} r="2.8" fill={color} />
      <circle cx={width} cy={endY} r="2.8" fill={color} />

      <g transform={`translate(8,${Math.max(9, startY - 7)})`}>
        <rect
          x="0"
          y="-8"
          width="24"
          height="12"
          rx="3"
          fill="#11131d"
          stroke={color}
          strokeWidth="1"
        />
        <text
          x="12"
          y="1"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill={color}
          letterSpacing="0.6"
        >
          {tag}
        </text>
      </g>

      <g transform={`translate(${width - 32},${Math.max(9, endY - 7)})`}>
        <rect
          x="0"
          y="-8"
          width="24"
          height="12"
          rx="3"
          fill="#11131d"
          stroke={color}
          strokeWidth="1"
        />
        <text
          x="12"
          y="1"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill={color}
          letterSpacing="0.6"
        >
          {tag}
        </text>
      </g>
    </svg>
  );
}

function SplitsTable({
  rows,
  fastest,
}: {
  rows: SplitRow[];
  fastest: {
    s1: number | null;
    s2: number | null;
    s3: number | null;
    lap: number | null;
    i1: number | null;
    i2: number | null;
    st: number | null;
  };
}) {
  const { metricSystem } = useSettings();

  if (rows.length === 0) return null;
  const speedUnit = speedUnitLabel(metricSystem);

  const fmt = (v: number | null) => (v === null ? "-" : v.toFixed(3));
  const fmtLap = (v: number | null) => formatLapTime(v);
  const fmtSpeed = (v: number | null) =>
    v === null ? "-" : `${Math.round(toDisplaySpeed(v, metricSystem))}`;
  // Lower sector time = better (min wins); higher speed = better (max wins)
  const clsMin = (v: number | null, best: number | null) =>
    v !== null && best !== null && v === best ? "text-[#b48ead]" : "text-white";
  const clsMax = (v: number | null, best: number | null) =>
    v !== null && best !== null && v === best ? "text-[#88c0d0]" : "text-white";

  const hasSpeedData = rows.some(
    (r) => r.i1 !== null || r.i2 !== null || r.st !== null,
  );

  return (
    <div className={PANEL}>
      <div className={PANEL_TITLE}>Sector splits</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] font-mono text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[#636369]">
              <th className="whitespace-nowrap px-2 py-1 text-left sm:px-3">
                Driver
              </th>
              <th className="whitespace-nowrap px-2 py-1 text-right sm:px-3">
                Lap #
              </th>
              <th className="whitespace-nowrap px-2 py-1 text-right sm:px-3">
                S1
              </th>
              <th className="whitespace-nowrap px-2 py-1 text-right sm:px-3">
                S2
              </th>
              <th className="whitespace-nowrap px-2 py-1 text-right sm:px-3">
                S3
              </th>
              <th className="whitespace-nowrap px-2 py-1 text-right sm:px-3">
                Lap
              </th>
              {hasSpeedData && (
                <>
                  <th className="whitespace-nowrap px-2 py-1 text-right text-[#88c0d0] sm:px-3">
                    I1
                  </th>
                  <th className="whitespace-nowrap px-2 py-1 text-right text-[#88c0d0] sm:px-3">
                    I2
                  </th>
                  <th
                    className="whitespace-nowrap px-2 py-1 text-right text-[#88c0d0] sm:px-3"
                    title={`Speed trap (${speedUnit})`}
                  >
                    ST
                  </th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={`${r.num}-${r.lapNo}`} className="border-t border-panel">
                <td className="whitespace-nowrap px-2 py-1 sm:px-3">
                  <span className="font-black" style={{ color: r.color }}>
                    {r.acr}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted sm:px-3">
                  {r.lapNo}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3 ${clsMin(r.s1, fastest.s1)}`}
                >
                  {fmt(r.s1)}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3 ${clsMin(r.s2, fastest.s2)}`}
                >
                  {fmt(r.s2)}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3 ${clsMin(r.s3, fastest.s3)}`}
                >
                  {fmt(r.s3)}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-1 text-right tabular-nums font-bold sm:px-3 ${clsMin(
                    r.lap,
                    fastest.lap,
                  )}`}
                >
                  {fmtLap(r.lap)}
                </td>
                {hasSpeedData && (
                  <>
                    <td
                      className={`whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3 ${clsMax(r.i1, fastest.i1)}`}
                      title="Intermediate 1 speed"
                    >
                      {fmtSpeed(r.i1)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3 ${clsMax(r.i2, fastest.i2)}`}
                      title="Intermediate 2 speed"
                    >
                      {fmtSpeed(r.i2)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3 ${clsMax(r.st, fastest.st)}`}
                      title={`Speed trap (${speedUnit})`}
                    >
                      {fmtSpeed(r.st)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasSpeedData && (
        <p className="px-3 py-1 text-[10px] text-[#636369]">
          I1 / I2 = intermediate speeds · ST = speed trap · unit: {speedUnit} ·
          cyan = fastest
        </p>
      )}
    </div>
  );
}
