import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  CloudRain,
  Droplets,
  Gauge,
  LocateFixed,
  RotateCcw,
  RotateCw,
  Search,
  Thermometer,
  Wind,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCarDataForLap,
  type TelemetrySample,
} from "@/hooks/useCarDataForLap";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import {
  computeTrackAutoRotationDeg,
  useTrackOutline,
  locationToSvg,
} from "@/hooks/useTrackMap";
import { buildIndex, interpolateXY } from "@/timeline/interpolate";
import { teamColor } from "@/utils/color";
import { useSettings } from "@/stores/settings";
import { resampleToAxis } from "@/utils/telemetry";
import {
  speedUnitLabel,
  toDisplaySpeed,
  toDisplayTemperature,
  temperatureUnitLabel,
  toDisplayWindSpeed,
  windSpeedUnitLabel,
} from "@/utils/units";
import type { CarData, Driver, Location, Stint, Weather } from "@/api/types";
import {
  TRACK_SVG_W as SVG_W,
  TRACK_SVG_H as SVG_H,
  TRACK_SVG_PAD as PAD,
  SECTOR_COLORS,
  COMPOUND_COLORS,
  FOLLOW_ZOOM_W,
  FOLLOW_ZOOM_H,
} from "@/constants";
import {
  clampFollowView,
  lerpCameraView,
  type CameraView,
} from "./trackCamera";
import { getCircuitLayout } from "@/data/circuits";
import { getCircuitGeometry } from "@/data/circuitGeometry";

// Speed → HSL color: 0 km/h = blue (240°), 150 = green (120°), 300+ = red (0°).
// Matches the F1 broadcast "speed trace" convention.
function speedToColor(speed: number): string {
  const hue = Math.round(240 - Math.min(speed / 300, 1) * 240);
  return `hsl(${hue},100%,55%)`;
}

function windDir(deg: number): string {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16] ?? "-";
}

function normalizeDeg(deg: number): number {
  let value = deg;
  while (value < -180) value += 360;
  while (value > 180) value -= 360;
  return value;
}

const ROTATION_STEP_DEG = 15;
const FOLLOW_CAMERA_FOCUS_ALPHA = 0.35;
const FOLLOW_CAMERA_RETURN_ALPHA = 0.2;

// Serialize the live SVG to a hi-DPI PNG and trigger a browser download.
// Uses XMLSerializer → Image → Canvas pipeline — no extra dependencies.
function exportTrackSnapshot(svgEl: SVGSVGElement): void {
  const w = svgEl.clientWidth || SVG_W;
  const h = svgEl.clientHeight || SVG_H;
  const dpr = window.devicePixelRatio || 1;
  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.scale(dpr, dpr);
    // Fill background so the PNG isn't transparent where the SVG bg is set via CSS.
    ctx.fillStyle = "#15151e";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pngBlob);
      a.download = "f1-replay.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

export interface ActiveTrackFlag {
  flag: string;
  scope: string | null;
  sector: number | null;
}

export interface ActiveTrackFlagState {
  globalFlag: string | null;
  sectorFlags: {
    1: string | null;
    2: string | null;
    3: string | null;
  };
  updatedAtMs: number;
}

export interface ActiveTrackVehicles {
  safetyCar: boolean;
  vsc: boolean;
  medicalCar: boolean;
  formationLap?: boolean;
}

interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly focusDriver?: number | null;
  readonly pulseDrivers?: readonly number[];
  readonly circuitShortName?: string | null;
  readonly circuitKey?: number | null;
  readonly activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly focusDriverLap?: number | null;
  readonly weatherOverlay?: Weather | null;
  readonly activeSectorFlag?: ActiveTrackFlag | null;
  readonly activeTrackFlagState?: ActiveTrackFlagState | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly showSectorBox?: boolean;
  readonly showTrackControls?: boolean;
  readonly showCompass?: boolean;
  readonly showFocusedHud?: boolean;
  readonly showTrackScreenshot?: boolean;
  readonly showEnhancedVisuals?: boolean;
  readonly onSelectDriver?: (driverNumber: number) => void;
}

export function TrackMap({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  focusDriver = null,
  pulseDrivers,
  circuitShortName,
  circuitKey = null,
  activeCompounds,
  battlingDrivers,
  retiredDrivers,
  focusDriverLap = null,
  weatherOverlay = null,
  activeSectorFlag = null,
  activeTrackFlagState = null,
  activeTrackVehicles = null,
  showSectorBox = true,
  showTrackControls = true,
  showCompass = true,
  showFocusedHud = true,
  showTrackScreenshot = true,
  showEnhancedVisuals = true,
  onSelectDriver,
}: Props) {
  const t = useCoarseTime(100);
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const mapShowDriverAcronym = useSettings((s) => s.mapShowDriverAcronym);
  const mapShowDriverNumberInside = useSettings(
    (s) => s.mapShowDriverNumberInside,
  );
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);
  const cameraViewRef = useRef<CameraView>({ x: 0, y: 0, w: SVG_W, h: SVG_H });

  useEffect(() => {
    cameraViewRef.current = { x: 0, y: 0, w: SVG_W, h: SVG_H };
  }, [sessionKey]);
  const finishPatternId = `finish-checker-${sessionKey ?? "na"}`;
  const rotationStorageKey = useMemo(
    () =>
      `f1-replay:track-rotation:${sessionKey ?? "none"}:${circuitKey ?? "none"}`,
    [sessionKey, circuitKey],
  );

  const setAndPersistRotation = useCallback(
    (next: number) => {
      const normalized = normalizeDeg(next);
      setRotationDeg(normalized);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(rotationStorageKey, String(normalized));
      } catch {
        // Ignore storage errors (private mode / quota).
      }
    },
    [rotationStorageKey],
  );

  const mapBackground = lightMode ? "#eef1fa" : "#15151e";
  const overlayBackground = lightMode
    ? "rgba(238,241,250,0.88)"
    : "rgba(21,21,30,0.82)";
  const hudBackground = lightMode
    ? "rgba(238,241,250,0.9)"
    : "rgba(21,21,30,0.85)";
  const weatherOverlayClass = lightMode
    ? weatherOverlay?.rainfall && weatherOverlay.rainfall > 0
      ? "border-l-sky-500 bg-[linear-gradient(135deg,rgba(137,186,255,0.38)_0%,rgba(238,241,250,0.95)_55%)]"
      : "border-l-[#9ca6bc] bg-[linear-gradient(135deg,rgba(187,193,209,0.45)_0%,rgba(238,241,250,0.95)_55%)]"
    : weatherOverlay?.rainfall && weatherOverlay.rainfall > 0
      ? "border-l-sky-400 bg-[linear-gradient(135deg,rgba(18,40,74,0.45)_0%,rgba(21,21,30,0.95)_55%)]"
      : "border-l-[#4b4b57] bg-[linear-gradient(135deg,rgba(34,36,50,0.45)_0%,rgba(21,21,30,0.95)_55%)]";
  const speedUnit = speedUnitLabel(metricSystem);
  const tempUnit = temperatureUnitLabel(metricSystem);
  const windUnit = windSpeedUnitLabel(metricSystem);

  const normalizedTrackFlagState = useMemo<ActiveTrackFlagState | null>(() => {
    if (activeTrackFlagState) return activeTrackFlagState;
    if (!activeSectorFlag?.flag) return null;

    const flagKey = activeSectorFlag.flag
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");

    const state: ActiveTrackFlagState = {
      globalFlag: flagKey,
      sectorFlags: { 1: null, 2: null, 3: null },
      updatedAtMs: 0,
    };

    const sector = activeSectorFlag.sector;
    const isSector =
      (sector === 1 || sector === 2 || sector === 3) &&
      !(activeSectorFlag.scope?.toLowerCase().includes("track") ?? false);

    if (isSector) {
      state.globalFlag = null;
      state.sectorFlags[sector] = flagKey;
    }

    return state;
  }, [activeTrackFlagState, activeSectorFlag]);

  // Rolling 5-min car_data window for the focused driver — drives the live HUD overlay.
  const chunkIdx = chunkIndexFor(t);
  const { data: hudRawData } = useCarDataWindow(
    sessionKey,
    showFocusedHud ? focusDriver : null,
    sessionStartMs,
    chunkIdx,
  );

  // Baked official geometry — available immediately when the bake script has run.
  const circuitGeom =
    circuitKey != null ? getCircuitGeometry(circuitKey) : null;
  const hasBaked = circuitGeom != null;

  // Driver fallback loop: only needed for the GPS path (no baked data).
  const [driverFallbackIdx, setDriverFallbackIdx] = useState(0);
  useEffect(() => {
    setDriverFallbackIdx(0);
  }, [sessionKey]);

  const candidateDriver = hasBaked
    ? null
    : (drivers[driverFallbackIdx] ?? drivers[0] ?? null);
  const { data: outline, isPending } = useTrackOutline(
    sessionKey,
    candidateDriver?.driver_number ?? null,
    circuitKey,
    circuitShortName ?? null,
  );

  useEffect(() => {
    if (
      !hasBaked &&
      !isPending &&
      outline === null &&
      driverFallbackIdx < drivers.length - 1
    ) {
      setDriverFallbackIdx((i) => i + 1);
    }
  }, [outline, isPending, driverFallbackIdx, drivers.length, hasBaked]);

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Group location points by driver and build a typed-array index per driver.
  // Rebuilds only when locationData or sessionStartMs changes (not on every frame).
  const locationIndexes = useMemo(() => {
    const byDriver = new Map<
      number,
      Array<{ t: number; x: number; y: number }>
    >();
    for (const loc of locationData) {
      const relT = new Date(loc.date).getTime() - sessionStartMs;
      let arr = byDriver.get(loc.driver_number);
      if (!arr) {
        arr = [];
        byDriver.set(loc.driver_number, arr);
      }
      arr.push({ t: relT, x: loc.x, y: loc.y });
    }
    const indexes = new Map<number, ReturnType<typeof buildIndex>>();
    for (const [num, pts] of byDriver) {
      pts.sort((a, b) => a.t - b.t);
      indexes.set(num, buildIndex(pts));
    }
    return indexes;
  }, [locationData, sessionStartMs]);

  const circuitLayout = useMemo(
    () => (circuitShortName ? getCircuitLayout(circuitShortName) : null),
    [circuitShortName],
  );

  // Memoize the SVG path string and shared coordinate transform — only changes when
  // the track outline itself changes (once per session), not on every frame.
  const trackGeometry = useMemo(() => {
    if (!outline) return null;
    const { points, bounds } = outline;
    const innerW = SVG_W - PAD * 2;
    const innerH = SVG_H - PAD * 2;

    const svgPts = points.map((p) => {
      const { sx, sy } = locationToSvg(p.x, p.y, bounds, innerW, innerH);
      return { sx: sx + PAD, sy: sy + PAD };
    });
    const n = svgPts.length;
    const get = (i: number) => svgPts[((i % n) + n) % n]!;
    let pathData = `M${get(0).sx.toFixed(1)},${get(0).sy.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = get(i - 1),
        p1 = get(i),
        p2 = get(i + 1),
        p3 = get(i + 2);
      const cp1x = p1.sx + (p2.sx - p0.sx) / 6;
      const cp1y = p1.sy + (p2.sy - p0.sy) / 6;
      const cp2x = p2.sx - (p3.sx - p1.sx) / 6;
      const cp2y = p2.sy - (p3.sy - p1.sy) / 6;
      pathData += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.sx.toFixed(1)},${p2.sy.toFixed(1)}`;
    }
    pathData += " Z";

    // Normalized cumulative arc length for each outline point — used to map
    // telemetry distance (0–1) onto track geometry for the speed heat overlay.
    const arcLengths: number[] = [0];
    for (let i = 0; i < svgPts.length - 1; i++) {
      const dx = svgPts[i + 1]!.sx - svgPts[i]!.sx;
      const dy = svgPts[i + 1]!.sy - svgPts[i]!.sy;
      arcLengths.push(arcLengths[i]! + Math.sqrt(dx * dx + dy * dy));
    }
    const totalArc = arcLengths[arcLengths.length - 1] || 1;
    const normArc = arcLengths.map((l) => l / totalArc);

    return { pathData, bounds, innerW, innerH, svgPts, normArc };
  }, [outline]);

  const defaultRotationDeg = useMemo(
    () => computeTrackAutoRotationDeg(outline?.points ?? [], true),
    [outline],
  );

  const rotateLeft = useCallback(() => {
    setAndPersistRotation(rotationDeg - ROTATION_STEP_DEG);
  }, [rotationDeg, setAndPersistRotation]);

  const rotateRight = useCallback(() => {
    setAndPersistRotation(rotationDeg + ROTATION_STEP_DEG);
  }, [rotationDeg, setAndPersistRotation]);

  useEffect(() => {
    setZoomLevel(1);
    if (typeof window === "undefined") {
      setRotationDeg(defaultRotationDeg);
      return;
    }
    try {
      const saved = window.localStorage.getItem(rotationStorageKey);
      const parsed = saved === null ? Number.NaN : Number(saved);
      setRotationDeg(
        Number.isFinite(parsed) ? normalizeDeg(parsed) : defaultRotationDeg,
      );
    } catch {
      setRotationDeg(defaultRotationDeg);
    }
  }, [rotationStorageKey, defaultRotationDeg]);

  // Fetch telemetry for the focused driver's last completed lap.
  // Only fires when a driver is focused and a lap number is known; result is
  // cached forever (staleTime: Infinity) so lap changes cost one extra API call.
  const heatData = useCarDataForLap(
    sessionKey,
    focusDriver,
    focusDriverLap ?? null,
  );
  const referenceHeatData = useCarDataForLap(
    sessionKey,
    focusDriver,
    focusDriverLap != null && focusDriverLap > 1 ? focusDriverLap - 1 : null,
  );

  // Map telemetry distance onto track arc positions to build colored segments.
  const heatSegments = useMemo(() => {
    const samples = heatData.data;
    if (!trackGeometry || !samples?.length) return [];
    const { svgPts, normArc } = trackGeometry;
    const totalDist = samples[samples.length - 1]!.distM || 1;

    return svgPts.slice(0, -1).map((pt, i) => {
      // Mid-point normalized position of this segment
      const midNorm = (normArc[i]! + normArc[i + 1]!) / 2;
      const targetDist = midNorm * totalDist;
      // Binary search for the closest sample at this distance
      let lo = 0,
        hi = samples.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (samples[mid]!.distM < targetDist) lo = mid + 1;
        else hi = mid;
      }
      const sample = samples[lo] ?? samples[samples.length - 1]!;
      return {
        x1: pt.sx,
        y1: pt.sy,
        x2: svgPts[i + 1]!.sx,
        y2: svgPts[i + 1]!.sy,
        speed: sample.speed,
      };
    });
  }, [trackGeometry, heatData.data]);

  const elevationSegments = useMemo(() => {
    if (!trackGeometry || !hasBaked) return [];
    const referenceDriver = focusDriver ?? drivers[0]?.driver_number ?? null;
    if (referenceDriver == null) return [];

    const samples = locationData
      .filter((loc) => loc.driver_number === referenceDriver)
      .map((loc) => ({
        t: new Date(loc.date).getTime(),
        x: loc.x,
        y: loc.y,
        z: loc.z,
      }))
      .sort((a, b) => a.t - b.t);

    if (samples.length < 2) return [];

    const cumulative: number[] = [0];
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]!;
      const curr = samples[i]!;
      cumulative.push(
        cumulative[i - 1]! + Math.hypot(curr.x - prev.x, curr.y - prev.y),
      );
    }

    const totalDist = cumulative.at(-1) || 1;
    if (totalDist <= 0) return [];

    const normSamples = samples.map((sample, i) => ({
      norm: cumulative[i]! / totalDist,
      z: sample.z,
    }));

    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const sample of normSamples) {
      if (sample.z < minZ) minZ = sample.z;
      if (sample.z > maxZ) maxZ = sample.z;
    }

    const zRange = maxZ - minZ;
    if (!Number.isFinite(zRange) || zRange < 0.5) return [];

    const { svgPts, normArc } = trackGeometry;
    return svgPts.slice(0, -1).map((pt, i) => {
      const next = svgPts[i + 1]!;
      const midNorm = (normArc[i]! + normArc[i + 1]!) / 2;
      let lo = 0;
      let hi = normSamples.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (normSamples[mid]!.norm < midNorm) lo = mid + 1;
        else hi = mid;
      }

      const sample = normSamples[lo] ?? normSamples.at(-1)!;
      const rawRatio = (sample.z - minZ) / zRange;
      const ratio = Number.isFinite(rawRatio)
        ? Math.max(0, Math.min(rawRatio, 1))
        : 0;
      const hue = Math.round(220 - ratio * 190);
      const lightness = lightMode ? 42 : 58;
      return {
        x1: pt.sx,
        y1: pt.sy,
        x2: next.sx,
        y2: next.sy,
        color: `hsl(${hue},78%,${lightness}%)`,
        opacity: 0.14 + ratio * 0.34,
      };
    });
  }, [trackGeometry, hasBaked, focusDriver, drivers, locationData, lightMode]);

  const deltaSegments = useMemo(() => {
    const currentSamples = heatData.data;
    const referenceSamples = referenceHeatData.data;
    if (
      !trackGeometry ||
      !currentSamples?.length ||
      !referenceSamples?.length
    ) {
      return [];
    }

    const resampledReference = resampleToAxis(currentSamples, referenceSamples);
    const { svgPts, normArc } = trackGeometry;
    const totalDist = currentSamples.at(-1)?.distM || 1;

    return svgPts.slice(0, -1).map((pt, i) => {
      const midNorm = (normArc[i]! + normArc[i + 1]!) / 2;
      const targetDist = midNorm * totalDist;
      let lo = 0;
      let hi = currentSamples.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (currentSamples[mid]!.distM < targetDist) lo = mid + 1;
        else hi = mid;
      }
      const current = currentSamples[lo] ?? currentSamples.at(-1)!;
      const reference = resampledReference[lo] ?? resampledReference.at(-1)!;
      const deltaS = reference.timeS - current.timeS;
      const rawIntensity = Math.abs(deltaS) / 0.18;
      const intensity = Number.isFinite(rawIntensity)
        ? Math.min(rawIntensity, 1)
        : 0;
      return {
        x1: pt.sx,
        y1: pt.sy,
        x2: svgPts[i + 1]!.sx,
        y2: svgPts[i + 1]!.sy,
        color: deltaS >= 0 ? "#33d17a" : "#ff5b6e",
        opacity: 0.1 + intensity * 0.38,
      };
    });
  }, [trackGeometry, heatData.data, referenceHeatData.data]);

  const brakingHotspots = useMemo(() => {
    const samples = heatData.data;
    if (!trackGeometry || !samples?.length) return [];

    const totalDist = samples.at(-1)?.distM || 1;
    const peaks: TelemetrySample[] = [];
    let currentPeak: TelemetrySample | null = null;

    for (const sample of samples) {
      const hardBrake = sample.brake >= 72 && sample.speed >= 90;
      if (hardBrake) {
        if (!currentPeak || sample.brake > currentPeak.brake) {
          currentPeak = sample;
        }
      } else if (currentPeak) {
        peaks.push(currentPeak);
        currentPeak = null;
      }
    }
    if (currentPeak) peaks.push(currentPeak);

    const { svgPts, normArc } = trackGeometry;
    return peaks.slice(0, 8).map((sample, index) => {
      const sampleNorm = totalDist > 0 ? sample.distM / totalDist : 0;
      const pointIndex = normArc.findIndex((value) => value >= sampleNorm);
      const point =
        svgPts[pointIndex === -1 ? svgPts.length - 1 : pointIndex] ??
        svgPts[0]!;
      const rawIntensity = (sample.brake - 70) / 30;
      const intensity = Number.isFinite(rawIntensity)
        ? Math.max(0, Math.min(rawIntensity, 1))
        : 0;
      return {
        key: `brake-hotspot-${index}-${sample.distM.toFixed(0)}`,
        x: point.sx,
        y: point.sy,
        radius: 4 + intensity * 5,
        opacity: 0.14 + intensity * 0.24,
      };
    });
  }, [trackGeometry, heatData.data]);

  const heatStats = useMemo(() => {
    const samples = heatData.data;
    if (!samples?.length) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    for (const sample of samples) {
      const speed = sample.speed;
      if (speed < min) min = speed;
      if (speed > max) max = speed;
      sum += speed;
    }
    const avg = sum / samples.length;
    return {
      min: Math.round(toDisplaySpeed(min, metricSystem)),
      avg: Math.round(toDisplaySpeed(avg, metricSystem)),
      max: Math.round(toDisplaySpeed(max, metricSystem)),
    };
  }, [heatData.data, metricSystem]);

  // Start/finish marker anchored to the first outline segment.
  const startFinishOverlay = useMemo(() => {
    if (!trackGeometry || trackGeometry.svgPts.length < 2) return null;
    const p0 = trackGeometry.svgPts[0]!;
    const p1 = trackGeometry.svgPts[1]!;
    const dx = p1.sx - p0.sx;
    const dy = p1.sy - p0.sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = 7;
    const cx = p0.sx;
    const cy = p0.sy;
    const x1 = cx + nx * half;
    const y1 = cy + ny * half;
    const x2 = cx - nx * half;
    const y2 = cy - ny * half;
    return (
      <g>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={lightMode ? "#111318" : "#f2f4fb"}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.95}
        />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`url(#${finishPatternId})`}
          strokeWidth={6}
          strokeLinecap="round"
          opacity={1}
        />
      </g>
    );
  }, [trackGeometry, lightMode, finishPatternId]);

  const sectorBoundaryOverlays = useMemo(() => {
    if (!trackGeometry || trackGeometry.svgPts.length < 6) return null;
    const { svgPts, normArc } = trackGeometry;

    const markerFor = (target: number, label: "S1" | "S2") => {
      const idx = Math.max(
        1,
        normArc.findIndex((value) => value >= target),
      );
      if (idx <= 0) return null;
      const point = svgPts[idx]!;
      const prev = svgPts[idx - 1]!;
      const dx = point.sx - prev.sx;
      const dy = point.sy - prev.sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = 6.5;
      const x1 = point.sx + nx * half;
      const y1 = point.sy + ny * half;
      const x2 = point.sx - nx * half;
      const y2 = point.sy - ny * half;
      const lx = point.sx + nx * 9.8;
      const ly = point.sy + ny * 9.8;

      return (
        <g key={`sector-boundary-${label}`}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9aa4be"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.82}
          />
          <circle
            cx={point.sx}
            cy={point.sy}
            r={3.1}
            fill={mapBackground}
            stroke="#aeb8cf"
            strokeWidth={0.8}
            opacity={0.95}
          />
          <text
            x={lx}
            y={ly}
            transform={`rotate(${-rotationDeg.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={4.8}
            fill={lightMode ? "#2a3246" : "#d4dbee"}
            fontFamily="Inter, sans-serif"
            fontWeight="900"
            letterSpacing="0.04em"
          >
            {label}
          </text>
        </g>
      );
    };

    return (
      <>
        {markerFor(1 / 3, "S1")}
        {markerFor(2 / 3, "S2")}
      </>
    );
  }, [trackGeometry, mapBackground, rotationDeg, lightMode]);

  const directionArrows = useMemo(() => {
    if (!trackGeometry || trackGeometry.svgPts.length < 12) return null;
    const { svgPts } = trackGeometry;
    const count = 10;

    return (
      <>
        {Array.from({ length: count }, (_, i) => {
          const idx = Math.floor((i / count) * (svgPts.length - 1));
          const point = svgPts[idx]!;
          const next = svgPts[(idx + 1) % svgPts.length]!;
          const angle =
            (Math.atan2(next.sy - point.sy, next.sx - point.sx) * 180) /
            Math.PI;
          return (
            <g
              key={`arrow-${idx}`}
              transform={`translate(${point.sx.toFixed(1)} ${point.sy.toFixed(1)}) rotate(${angle.toFixed(1)})`}
              opacity={0.62}
            >
              <path
                d="M-3.4,-1.5 L2.8,0 L-3.4,1.5"
                fill="none"
                stroke={lightMode ? "#303647" : "#d8deee"}
                strokeWidth={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </>
    );
  }, [trackGeometry, lightMode]);

  // Corner number labels from baked geometry — placed at each corner's trackPosition.
  const cornerOverlays = useMemo(() => {
    if (!trackGeometry || !circuitGeom || !circuitGeom.corners.length)
      return null;
    const { bounds, innerW, innerH } = trackGeometry;
    return (
      <>
        {circuitGeom.corners.map((corner) => {
          const { sx, sy } = locationToSvg(
            corner.trackPosition.x,
            corner.trackPosition.y,
            bounds,
            innerW,
            innerH,
          );
          const cx = sx + PAD,
            cy = sy + PAD;
          return (
            <g key={`corner-${corner.number}`} opacity={0.55}>
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill="none"
                stroke="#6b6b7a"
                strokeWidth={0.8}
              />
              <text
                x={cx}
                y={cy + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={4.5}
                fill="#9b9baa"
                fontFamily="Inter, sans-serif"
                fontWeight="700"
              >
                {corner.number}
                {corner.letter}
              </text>
            </g>
          );
        })}
      </>
    );
  }, [trackGeometry, circuitGeom]);

  // Marshal sector tick marks from baked geometry.
  // Coloured by timing-sector (S1/S2/S3) based on which third of the circuit each belongs to.
  const marshalSectorOverlays = useMemo(() => {
    if (!trackGeometry || !circuitGeom || !circuitGeom.marshalSectors.length)
      return null;
    const { bounds, innerW, innerH } = trackGeometry;
    const total = circuitGeom.marshalSectors.length;
    return (
      <>
        {circuitGeom.marshalSectors.map((ms, i) => {
          const { sx, sy } = locationToSvg(
            ms.trackPosition.x,
            ms.trackPosition.y,
            bounds,
            innerW,
            innerH,
          );
          const cx = sx + PAD,
            cy = sy + PAD;
          const sector = (i < total / 3 ? 1 : i < (2 * total) / 3 ? 2 : 3) as
            | 1
            | 2
            | 3;
          const color = SECTOR_COLORS[sector];
          return (
            <circle
              key={`ms-${ms.number}`}
              cx={cx}
              cy={cy}
              r={2.5}
              fill={color}
              fillOpacity={0.35}
              stroke={color}
              strokeWidth={0.6}
              strokeOpacity={0.6}
            />
          );
        })}
      </>
    );
  }, [trackGeometry, circuitGeom]);

  // Memoize DRS + legacy sector rectangles (shown only when no baked geometry).
  const staticOverlays = useMemo(() => {
    if (!trackGeometry) return null;
    const { bounds, innerW, innerH } = trackGeometry;
    const drsElements =
      circuitLayout?.drsZones.map((zone, idx) => {
        const { sx: sx1, sy: sy1 } = locationToSvg(
          zone.line.x1,
          zone.line.y1,
          bounds,
          innerW,
          innerH,
        );
        const { sx: sx2, sy: sy2 } = locationToSvg(
          zone.line.x2,
          zone.line.y2,
          bounds,
          innerW,
          innerH,
        );
        return (
          <g key={`drs-${idx}`}>
            <line
              x1={sx1 + PAD}
              y1={sy1 + PAD}
              x2={sx2 + PAD}
              y2={sy2 + PAD}
              stroke="#4da6ff"
              strokeWidth={3}
              opacity={0.8}
            />
            <circle cx={sx1 + PAD} cy={sy1 + PAD} r={2.5} fill="#4da6ff" />
          </g>
        );
      }) ?? [];

    // Legacy sector rectangles — only when no baked marshal sectors available.
    const sectorRects =
      !hasBaked && circuitLayout
        ? circuitLayout.sectors.map((sector) => {
            const { sx: sx1, sy: sy1 } = locationToSvg(
              sector.bounds.minX,
              sector.bounds.minY,
              bounds,
              innerW,
              innerH,
            );
            const { sx: sx2, sy: sy2 } = locationToSvg(
              sector.bounds.maxX,
              sector.bounds.maxY,
              bounds,
              innerW,
              innerH,
            );
            const x = Math.min(sx1, sx2) + PAD,
              y = Math.min(sy1, sy2) + PAD;
            const w = Math.abs(sx2 - sx1),
              h = Math.abs(sy2 - sy1);
            return (
              <g key={`sector-${sector.number}`} opacity={0.15}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={SECTOR_COLORS[sector.number]}
                />
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill={SECTOR_COLORS[sector.number]}
                  fontWeight="bold"
                  fontFamily="Inter, sans-serif"
                >
                  S{sector.number}
                </text>
              </g>
            );
          })
        : [];

    if (!drsElements.length && !sectorRects.length) return null;
    return (
      <>
        {sectorRects}
        {drsElements}
      </>
    );
  }, [trackGeometry, circuitLayout, hasBaked]);

  // Flag tint overlaid when a flag is active.
  // With baked geometry: precise colored dots at each marshal sector position.
  // Fallback: rectangle tints over legacy sector boxes.
  const sectorFlagTints = useMemo(() => {
    if (!trackGeometry || !normalizedTrackFlagState) return null;

    const TINT: Record<string, string> = {
      YELLOW: "#f5d400",
      DOUBLE_YELLOW: "#f5d400",
      RED: "#e8002d",
      SAFETY_CAR: "#f5a623",
      VIRTUAL_SC: "#f5a623",
      VIRTUAL_SAFETY_CAR: "#f5a623",
      GREEN: "#39b54a",
      CLEAR: "#39b54a",
    };

    const effectiveFlagForSector = (sector: 1 | 2 | 3): string | null => {
      if (normalizedTrackFlagState.globalFlag === "RED") return "RED";
      return (
        normalizedTrackFlagState.sectorFlags[sector] ??
        normalizedTrackFlagState.globalFlag
      );
    };

    const tintForSector = (sector: 1 | 2 | 3): string | null => {
      const flagKey = effectiveFlagForSector(sector);
      return flagKey ? (TINT[flagKey] ?? null) : null;
    };

    const { bounds, innerW, innerH } = trackGeometry;

    if (hasBaked && circuitGeom && circuitGeom.marshalSectors.length) {
      return (
        <>
          {circuitGeom.marshalSectors.map((ms, i) => {
            const total = circuitGeom.marshalSectors.length;
            const sector = (i < total / 3 ? 1 : i < (2 * total) / 3 ? 2 : 3) as
              | 1
              | 2
              | 3;
            const tint = tintForSector(sector);
            if (!tint) return null;
            const { sx, sy } = locationToSvg(
              ms.trackPosition.x,
              ms.trackPosition.y,
              bounds,
              innerW,
              innerH,
            );
            return (
              <circle
                key={`flag-ms-${ms.number}`}
                cx={sx + PAD}
                cy={sy + PAD}
                r={4}
                fill={tint}
                fillOpacity={0.7}
              />
            );
          })}
        </>
      );
    }

    if (!circuitLayout) return null;
    return (
      <>
        {circuitLayout.sectors.map((sector) => {
          const sectorNum = sector.number as 1 | 2 | 3;
          const tint = tintForSector(sectorNum);
          if (!tint) return null;
          const { sx: sx1, sy: sy1 } = locationToSvg(
            sector.bounds.minX,
            sector.bounds.minY,
            bounds,
            innerW,
            innerH,
          );
          const { sx: sx2, sy: sy2 } = locationToSvg(
            sector.bounds.maxX,
            sector.bounds.maxY,
            bounds,
            innerW,
            innerH,
          );
          const x = Math.min(sx1, sx2) + PAD,
            y = Math.min(sy1, sy2) + PAD;
          const w = Math.abs(sx2 - sx1),
            h = Math.abs(sy2 - sy1);
          return (
            <rect
              key={`flag-tint-${sector.number}`}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={tint}
              opacity={0.28}
            />
          );
        })}
      </>
    );
  }, [
    trackGeometry,
    circuitLayout,
    circuitGeom,
    hasBaked,
    normalizedTrackFlagState,
  ]);

  // Current-moment car telemetry for the focused driver — binary search on the rolling
  // 5-min window (same source as FocusedTelemetry). Runs at 60 fps, O(log n).
  const hudData = useMemo((): CarData | null => {
    if (focusDriver === null || !hudRawData.length) return null;
    const targetMs = sessionStartMs + t;
    let lo = 0,
      hi = hudRawData.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (new Date(hudRawData[mid]!.date).getTime() < targetMs) lo = mid + 1;
      else hi = mid;
    }
    const s = hudRawData[lo] ?? hudRawData[hudRawData.length - 1]!;
    const diff = Math.abs(new Date(s.date).getTime() - targetMs);
    return diff < 30_000 ? s : null;
  }, [hudRawData, sessionStartMs, t, focusDriver]);

  const trackConditionRibbonOverlay = useMemo(() => {
    if (!showEnhancedVisuals || !trackGeometry) return null;

    const ribbonColors: Record<string, string> = {
      YELLOW: "#f5d400",
      DOUBLE_YELLOW: "#f5d400",
      RED: "#e8002d",
      SAFETY_CAR: "#f5a623",
      VIRTUAL_SC: "#f5a623",
      VIRTUAL_SAFETY_CAR: "#f5a623",
      GREEN: "#39b54a",
      CLEAR: "#39b54a",
    };

    const flagForSector = (sector: 1 | 2 | 3): string => {
      if (!normalizedTrackFlagState) return "CLEAR";
      if (normalizedTrackFlagState.globalFlag === "RED") return "RED";
      return (
        normalizedTrackFlagState.sectorFlags[sector] ??
        normalizedTrackFlagState.globalFlag ??
        "CLEAR"
      );
    };

    const { pathData } = trackGeometry;
    return (
      <>
        <path
          d={pathData}
          fill="none"
          stroke={lightMode ? "#c9d1e3" : "#293043"}
          strokeWidth={20}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={lightMode ? 0.35 : 0.45}
        />
        {([1, 2, 3] as const).map((sectorNum) => {
          const flag = flagForSector(sectorNum);
          const color = ribbonColors[flag] ?? ribbonColors.CLEAR;
          const clipPath = circuitLayout?.sectors.some(
            (sector) => sector.number === sectorNum,
          )
            ? `url(#track-sector-clip-${sectorNum})`
            : undefined;
          const active = flag !== "CLEAR" && flag !== "GREEN";
          return (
            <path
              key={`ribbon-sector-${sectorNum}`}
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={20}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...(clipPath
                ? { clipPath }
                : {
                    pathLength: 300,
                    strokeDasharray: "100 200",
                    strokeDashoffset: -(sectorNum - 1) * 100,
                  })}
              opacity={active ? 0.5 : 0.24}
            />
          );
        })}
      </>
    );
  }, [
    showEnhancedVisuals,
    trackGeometry,
    normalizedTrackFlagState,
    circuitLayout,
    lightMode,
  ]);

  const marshalLightNodes = useMemo(() => {
    if (
      !showEnhancedVisuals ||
      !trackGeometry ||
      !circuitGeom?.marshalSectors.length
    ) {
      return null;
    }

    const lightColors: Record<string, string> = {
      YELLOW: "#f5d400",
      DOUBLE_YELLOW: "#f5d400",
      RED: "#e8002d",
      SAFETY_CAR: "#f5a623",
      VIRTUAL_SC: "#f5a623",
      VIRTUAL_SAFETY_CAR: "#f5a623",
      GREEN: "#39b54a",
      CLEAR: "#39b54a",
    };

    const flagForSector = (sector: 1 | 2 | 3): string => {
      if (!normalizedTrackFlagState) return "CLEAR";
      if (normalizedTrackFlagState.globalFlag === "RED") return "RED";
      return (
        normalizedTrackFlagState.sectorFlags[sector] ??
        normalizedTrackFlagState.globalFlag ??
        "CLEAR"
      );
    };

    const { bounds, innerW, innerH } = trackGeometry;
    const total = circuitGeom.marshalSectors.length;

    return (
      <>
        {circuitGeom.marshalSectors.map((marshalSector, i) => {
          const sector = (i < total / 3 ? 1 : i < (2 * total) / 3 ? 2 : 3) as
            | 1
            | 2
            | 3;
          const flag = flagForSector(sector);
          if (flag === "CLEAR" || flag === "GREEN") return null;
          const color = lightColors[flag] ?? lightColors.YELLOW;
          const { sx, sy } = locationToSvg(
            marshalSector.trackPosition.x,
            marshalSector.trackPosition.y,
            bounds,
            innerW,
            innerH,
          );
          const cx = sx + PAD;
          const cy = sy + PAD;
          return (
            <g key={`marshal-light-${marshalSector.number}`}>
              <circle cx={cx} cy={cy} r={3.1} fill={color} opacity={0.35}>
                <animate
                  attributeName="r"
                  values="2.4;4.8;2.4"
                  dur="1.25s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.25;0.62;0.25"
                  dur="1.25s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx={cx} cy={cy} r={1.45} fill={color} opacity={0.95} />
            </g>
          );
        })}
      </>
    );
  }, [
    showEnhancedVisuals,
    trackGeometry,
    circuitGeom,
    normalizedTrackFlagState,
  ]);

  const svgRef = useRef<SVGSVGElement>(null);

  if (!sessionKey) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        Select a session to load the track
      </div>
    );
  }

  if (isPending && !outline) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm animate-pulse">
        Loading track outline…
      </div>
    );
  }

  if (!outline) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        No location data available for this session
      </div>
    );
  }

  // trackGeometry is guaranteed non-null here: the `!outline` early-return above fires first.
  const { pathData, bounds, innerW, innerH } = trackGeometry!;

  // Interpolate each driver's position at the current playhead time t (session-relative ms).
  // This runs per-frame — it's the only thing that should.
  const carPositions: Array<{ num: number; x: number; y: number }> = [];
  for (const [num, idx] of locationIndexes) {
    if (retiredDrivers?.has(num)) continue;
    const pos = interpolateXY(idx, t);
    if (pos) carPositions.push({ num, ...pos });
  }

  const pulseSet = new Set(pulseDrivers ?? []);

  // Follow-cam: smoothly zooms/pans towards the focused driver. If a focused
  // car sample is temporarily missing, keep the previous camera to avoid snap-back.
  let nextViewTarget: CameraView = { x: 0, y: 0, w: SVG_W, h: SVG_H };
  if (focusDriver !== null) {
    const focusedPos = carPositions.find((c) => c.num === focusDriver);
    if (focusedPos) {
      const { sx, sy } = locationToSvg(
        focusedPos.x,
        focusedPos.y,
        bounds,
        innerW,
        innerH,
      );
      const cx = sx + PAD;
      const cy = sy + PAD;
      nextViewTarget = clampFollowView(
        cx,
        cy,
        SVG_W,
        SVG_H,
        FOLLOW_ZOOM_W,
        FOLLOW_ZOOM_H,
      );
    } else {
      nextViewTarget = cameraViewRef.current;
    }
  }

  const cameraAlpha =
    focusDriver !== null
      ? FOLLOW_CAMERA_FOCUS_ALPHA
      : FOLLOW_CAMERA_RETURN_ALPHA;
  const smoothedView = lerpCameraView(
    cameraViewRef.current,
    nextViewTarget,
    cameraAlpha,
  );
  cameraViewRef.current = smoothedView;

  const viewX = smoothedView.x;
  const viewY = smoothedView.y;
  const viewW = smoothedView.w;
  const viewH = smoothedView.h;

  const viewBox = `${viewX.toFixed(1)} ${viewY.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`;
  const pivotX = viewX + viewW / 2;
  const pivotY = viewY + viewH / 2;
  const zoomTransform = `translate(${pivotX.toFixed(1)} ${pivotY.toFixed(1)}) scale(${zoomLevel.toFixed(2)}) translate(${-pivotX.toFixed(1)} ${-pivotY.toFixed(1)})`;
  const trackTransform = `rotate(${rotationDeg.toFixed(1)} ${pivotX.toFixed(1)} ${pivotY.toFixed(1)}) ${zoomTransform}`;

  const flagPalette: Record<string, { color: string; label: string }> = {
    YELLOW: { color: "#f5d400", label: "Yellow" },
    DOUBLE_YELLOW: { color: "#f5d400", label: "Double Yellow" },
    RED: { color: "#e8002d", label: "Red Flag" },
    SAFETY_CAR: { color: "#f5a623", label: "Safety Car" },
    VIRTUAL_SC: { color: "#f5a623", label: "VSC" },
    VIRTUAL_SAFETY_CAR: { color: "#f5a623", label: "VSC" },
    GREEN: { color: "#39b54a", label: "Green" },
    CLEAR: { color: "#39b54a", label: "Clear" },
  };

  const effectiveFlagForSector = (sector: 1 | 2 | 3): string | null => {
    if (!normalizedTrackFlagState) return null;
    if (normalizedTrackFlagState.globalFlag === "RED") return "RED";
    return (
      normalizedTrackFlagState.sectorFlags[sector] ??
      normalizedTrackFlagState.globalFlag
    );
  };

  const hasTrackConditionDisplay =
    normalizedTrackFlagState?.globalFlag != null ||
    effectiveFlagForSector(1) != null ||
    effectiveFlagForSector(2) != null ||
    effectiveFlagForSector(3) != null;

  const topStatusBadges = (() => {
    const badges: Array<{
      key: string;
      label: string;
      bg: string;
      border: string;
      text: string;
    }> = [];
    const seen = new Set<string>();

    const push = (
      key: string,
      label: string,
      bg: string,
      border: string,
      text: string,
    ) => {
      if (seen.has(key)) return;
      seen.add(key);
      badges.push({ key, label, bg, border, text });
    };

    if (activeTrackVehicles?.formationLap) {
      push("formation", "Formation Lap", "#1c1c2e", "#2d3550", "#c8c8ff");
    }
    if (activeTrackVehicles?.safetyCar) {
      push("safety_car", "Safety Car", "#f5a623", "#704600", "#101010");
    }
    if (activeTrackVehicles?.vsc) {
      push("vsc", "VSC", "#ffd166", "#7a5400", "#101010");
    }
    if (activeTrackVehicles?.medicalCar) {
      push("medical", "Medical Car", "#e8002d", "#5f121d", "#ffffff");
    }

    const addFlagBadge = (flag: string, suffix = "") => {
      if (flag === "GREEN" || flag === "CLEAR") return;

      // Avoid duplicate chips when the same state is already represented by
      // active track-vehicle status (e.g. SC or VSC).
      if (
        (flag === "SAFETY_CAR" && activeTrackVehicles?.safetyCar) ||
        ((flag === "VIRTUAL_SC" || flag === "VIRTUAL_SAFETY_CAR") &&
          activeTrackVehicles?.vsc)
      ) {
        return;
      }

      const labelMap: Record<string, string> = {
        YELLOW: "Yellow Flag",
        DOUBLE_YELLOW: "Double Yellow",
        RED: "Red Flag",
        SAFETY_CAR: "Safety Car",
        VIRTUAL_SC: "VSC",
        VIRTUAL_SAFETY_CAR: "VSC",
      };
      const color = flagPalette[flag]?.color;
      const label = labelMap[flag];
      if (!color || !label) return;
      const text = flag === "RED" ? "#ffffff" : "#101010";
      push(
        `flag_${flag}${suffix}`,
        `${label}${suffix}`,
        color,
        `${color}99`,
        text,
      );
    };

    if (normalizedTrackFlagState?.globalFlag) {
      addFlagBadge(normalizedTrackFlagState.globalFlag);
    } else {
      ([1, 2, 3] as const).forEach((sector) => {
        const flag = normalizedTrackFlagState?.sectorFlags[sector];
        if (!flag) return;
        addFlagBadge(flag, ` S${sector}`);
      });
    }

    return badges;
  })();

  return (
    <div className="relative w-full h-full">
      {topStatusBadges.length > 0 && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 flex flex-col items-center gap-1">
          {topStatusBadges.map((badge) => (
            <span
              key={badge.key}
              className="border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em]"
              style={{
                background: badge.bg,
                borderColor: badge.border,
                color: badge.text,
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full"
        style={{ background: mapBackground }}
      >
        <defs>
          <pattern
            id={finishPatternId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="4" height="4" fill="#ffffff" />
            <rect x="0" y="0" width="2" height="2" fill="#111111" />
            <rect x="2" y="2" width="2" height="2" fill="#111111" />
          </pattern>
          {trackGeometry && circuitLayout?.sectors
            ? circuitLayout.sectors.map((sector) => {
                const { sx: sx1, sy: sy1 } = locationToSvg(
                  sector.bounds.minX,
                  sector.bounds.minY,
                  bounds,
                  innerW,
                  innerH,
                );
                const { sx: sx2, sy: sy2 } = locationToSvg(
                  sector.bounds.maxX,
                  sector.bounds.maxY,
                  bounds,
                  innerW,
                  innerH,
                );
                const x = Math.min(sx1, sx2) + PAD;
                const y = Math.min(sy1, sy2) + PAD;
                const w = Math.abs(sx2 - sx1);
                const h = Math.abs(sy2 - sy1);
                return (
                  <clipPath
                    key={`track-sector-clip-${sector.number}`}
                    id={`track-sector-clip-${sector.number}`}
                    clipPathUnits="userSpaceOnUse"
                  >
                    <rect x={x} y={y} width={w} height={h} />
                  </clipPath>
                );
              })
            : null}
        </defs>
        <g transform={trackTransform}>
          {trackConditionRibbonOverlay}

          {showEnhancedVisuals &&
            elevationSegments.map((segment, i) => (
              <line
                key={`elev-shadow-${i}`}
                x1={segment.x1}
                y1={segment.y1}
                x2={segment.x2}
                y2={segment.y2}
                stroke={segment.color}
                strokeWidth={14}
                strokeLinecap="round"
                opacity={segment.opacity * 0.15}
              />
            ))}

          {/* Track surface: thick grey base + thin white highlight */}
          <path
            d={pathData}
            strokeWidth={16}
            fill="none"
            stroke="#1f2028"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.55}
          />
          <path
            d={pathData}
            strokeWidth={11}
            fill="none"
            stroke="#38383f"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={pathData}
            fill="none"
            stroke="#4a4a55"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={pathData}
            fill="none"
            stroke="#ffffff"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.15}
          />
          <path
            d={pathData}
            fill="none"
            stroke="#d7d7e0"
            strokeWidth={0.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1.2 5"
            strokeOpacity={0.2}
          />

          {/* Sector flag colors on track line */}
          {normalizedTrackFlagState &&
            (() => {
              const FLAG_COLORS: Record<string, string> = {
                YELLOW: "#f5d400",
                DOUBLE_YELLOW: "#f5d400",
                RED: "#e8002d",
                SAFETY_CAR: "#f5a623",
                VIRTUAL_SC: "#f5a623",
                VIRTUAL_SAFETY_CAR: "#f5a623",
                GREEN: "#39b54a",
                CLEAR: "#39b54a",
              };

              const globalFlag = normalizedTrackFlagState.globalFlag;

              // Global flags (RED, SC, VSC) paint the entire track — no sector splitting needed
              if (globalFlag) {
                const color = FLAG_COLORS[globalFlag] ?? null;
                if (!color) return null;
                return (
                  <g key="track-global-color">
                    <path
                      d={pathData}
                      fill="none"
                      stroke={color}
                      strokeWidth={14}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.25}
                    />
                    <path
                      d={pathData}
                      fill="none"
                      stroke={color}
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.7}
                    />
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.18}
                    />
                  </g>
                );
              }

              // Sector-specific: color only the affected third(s) of the track
              return (
                <>
                  {([1, 2, 3] as const).map((sectorNum) => {
                    const flag =
                      normalizedTrackFlagState.sectorFlags[sectorNum];
                    if (!flag) return null;
                    const color = FLAG_COLORS[flag] ?? null;
                    if (!color) return null;
                    const sectorClipPath = circuitLayout?.sectors.some(
                      (s) => s.number === sectorNum,
                    )
                      ? `url(#track-sector-clip-${sectorNum})`
                      : undefined;
                    return (
                      <g key={`track-sector-color-${sectorNum}`}>
                        <path
                          d={pathData}
                          fill="none"
                          stroke={color}
                          strokeWidth={14}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          {...(sectorClipPath
                            ? { clipPath: sectorClipPath }
                            : {
                                pathLength: 300,
                                strokeDasharray: "100 200",
                                strokeDashoffset: -(sectorNum - 1) * 100,
                              })}
                          opacity={0.25}
                        />
                        <path
                          d={pathData}
                          fill="none"
                          stroke={color}
                          strokeWidth={8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          {...(sectorClipPath
                            ? { clipPath: sectorClipPath }
                            : {
                                pathLength: 300,
                                strokeDasharray: "100 200",
                                strokeDashoffset: -(sectorNum - 1) * 100,
                              })}
                          opacity={0.7}
                        />
                        <path
                          d={pathData}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          {...(sectorClipPath
                            ? { clipPath: sectorClipPath }
                            : {
                                pathLength: 300,
                                strokeDasharray: "100 200",
                                strokeDashoffset: -(sectorNum - 1) * 100,
                              })}
                          opacity={0.18}
                        />
                      </g>
                    );
                  })}
                </>
              );
            })()}

          {/* Speed heat overlay — shown when a driver is focused and lap data is loaded.
          Segments are colored blue (slow) → green → red (fast) by the driver's
          recorded speed at each track position on their last completed lap. */}
          {heatSegments.length > 0 &&
            heatSegments.map((seg, i) => (
              <line
                key={i}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke={speedToColor(seg.speed)}
                strokeWidth={4}
                strokeLinecap="round"
                opacity={0.9}
              />
            ))}

          {showEnhancedVisuals &&
            deltaSegments.length > 0 &&
            deltaSegments.map((seg, i) => (
              <line
                key={`delta-${i}`}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke={seg.color}
                strokeWidth={7.5}
                strokeLinecap="round"
                opacity={seg.opacity}
              />
            ))}

          {showEnhancedVisuals &&
            elevationSegments.length > 0 &&
            elevationSegments.map((segment, i) => (
              <line
                key={`elev-accent-${i}`}
                x1={segment.x1}
                y1={segment.y1}
                x2={segment.x2}
                y2={segment.y2}
                stroke={segment.color}
                strokeWidth={2.2}
                strokeLinecap="round"
                opacity={segment.opacity}
              />
            ))}

          {/* Sectors + DRS overlays (session-static, memoized) */}
          {staticOverlays}

          {/* Marshal sector dots (baked geometry only) */}
          {marshalSectorOverlays}

          {marshalLightNodes}

          {/* Active flag tint over marshal sectors / sector boxes */}
          {sectorFlagTints}

          {/* Corner numbers (baked geometry only) */}
          {cornerOverlays}

          {showEnhancedVisuals &&
            brakingHotspots.map((hotspot) => (
              <g key={hotspot.key}>
                <circle
                  cx={hotspot.x}
                  cy={hotspot.y}
                  r={hotspot.radius}
                  fill="#ff6a3d"
                  opacity={hotspot.opacity}
                />
                <circle
                  cx={hotspot.x}
                  cy={hotspot.y}
                  r={Math.max(2.3, hotspot.radius * 0.4)}
                  fill="#ffd4b8"
                  opacity={Math.min(0.92, hotspot.opacity + 0.28)}
                />
              </g>
            ))}

          {/* Start/finish */}
          {startFinishOverlay}

          {showEnhancedVisuals ? sectorBoundaryOverlays : null}
          {showEnhancedVisuals ? directionArrows : null}

          {/* Car dots — when a driver is focused, dim the rest and enlarge the pick */}
          {carPositions
            .slice()
            .sort(
              (a, b) =>
                (a.num === focusDriver ? 1 : 0) -
                (b.num === focusDriver ? 1 : 0),
            )
            .map(({ num, x, y }) => {
              const driver = driverByNumber.get(num);
              const color = teamColor(driver?.team_colour, "#ffffff");
              const { sx, sy } = locationToSvg(x, y, bounds, innerW, innerH);
              const focused = focusDriver === num;
              const dimmed = focusDriver !== null && !focused;
              const showLabel =
                (focusDriver === null || focused) && mapShowDriverAcronym;
              const pulsing = pulseSet.has(num);
              const isBattling = battlingDrivers?.has(num) ?? false;
              const compoundInfo = activeCompounds?.get(num);
              const dotRadius = mapShowDriverNumberInside
                ? focused
                  ? 8
                  : 6.6
                : focused
                  ? 6.5
                  : 4.5;
              return (
                <g
                  key={num}
                  transform={`translate(${(sx + PAD).toFixed(1)},${(sy + PAD).toFixed(1)})`}
                  opacity={dimmed ? 0.3 : 1}
                  onClick={() => onSelectDriver?.(num)}
                  style={onSelectDriver ? { cursor: "pointer" } : undefined}
                >
                  {/* Battle ring: dashed amber ring for cars within 1 s of the car ahead */}
                  {isBattling && !pulsing && (
                    <circle
                      r={focused ? 13 : 8}
                      fill="none"
                      stroke="#ffd700"
                      strokeWidth={1.5}
                      strokeOpacity={0.75}
                      strokeDasharray="3 2"
                    />
                  )}
                  {pulsing && (
                    <circle
                      r={6}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    >
                      <animate
                        attributeName="r"
                        from="6"
                        to="14"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="stroke-opacity"
                        from="0.9"
                        to="0"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  {focused && (
                    <circle
                      r={dotRadius + 2.5}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                    />
                  )}
                  <circle
                    r={dotRadius}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={focused ? 1.6 : 1.2}
                    strokeOpacity={focused ? 0.9 : 0.6}
                  />
                  {mapShowDriverNumberInside && (
                    <text
                      x={0}
                      y={0}
                      transform={`rotate(${-rotationDeg.toFixed(1)} 0 0)`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={focused ? (num >= 10 ? 5.2 : 5.8) : 4.4}
                      fill="#ffffff"
                      stroke="rgba(0,0,0,0.58)"
                      strokeWidth={0.6}
                      paintOrder="stroke"
                      fontFamily="Inter, sans-serif"
                      fontWeight="900"
                    >
                      {num}
                    </text>
                  )}
                  {/* Compound badge: small dot in tyre-compound colour */}
                  {compoundInfo && (
                    <circle
                      cx={focused ? 8 : 5}
                      cy={focused ? 8 : 5}
                      r={focused ? 2.5 : 1.8}
                      fill={COMPOUND_COLORS[compoundInfo.compound]}
                      stroke={mapBackground}
                      strokeWidth={0.5}
                    />
                  )}
                  {showLabel && (
                    <text
                      x={focused ? 15 : 10}
                      y={-5}
                      textAnchor="end"
                      transform={`rotate(${-rotationDeg.toFixed(1)} ${(focused ? 15 : 10).toFixed(1)} ${(-5).toFixed(1)})`}
                      fontSize={focused ? 9 : 8}
                      fill={color}
                      fontFamily="Inter, sans-serif"
                      fontWeight="900"
                      letterSpacing="0.04em"
                    >
                      {driver?.name_acronym ?? num}
                    </text>
                  )}
                </g>
              );
            })}
        </g>

        {/* No-data hint — kept in a separate transformed group so it rotates with track */}
        {locationIndexes.size === 0 && (
          <g transform={trackTransform}>
            <text
              x={SVG_W / 2}
              y={SVG_H / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${-rotationDeg.toFixed(1)} ${SVG_W / 2} ${SVG_H / 2})`}
              fill="#636369"
              fontSize={11}
              fontFamily="Inter, sans-serif"
            >
              Press ▶ to start replay
            </text>
          </g>
        )}
      </svg>

      {showTrackControls && (
        <div
          className="absolute top-2 right-2 z-20 flex flex-col gap-1 p-1"
          style={{
            background: overlayBackground,
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(3, z + 0.2))}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Reset zoom"
            >
              <Search size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={rotateLeft}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Rotate left"
            >
              <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={rotateRight}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Rotate right"
            >
              <RotateCw size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setAndPersistRotation(defaultRotationDeg)}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Reset rotation"
            >
              <LocateFixed size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {focusDriver !== null && heatSegments.length > 0 && heatStats && (
        <div
          className="absolute top-2 left-1/2 z-20 -translate-x-1/2 pointer-events-none border border-[#3f4252] px-2 py-1"
          style={{
            background: overlayBackground,
            backdropFilter: "blur(4px)",
            minWidth: 186,
          }}
        >
          <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[0.14em] text-muted">
            <span>Lap Speed</span>
            <span>{speedUnit}</span>
          </div>
          <div
            className="mt-1 h-1.5"
            style={{
              background:
                "linear-gradient(90deg, hsl(240,100%,55%) 0%, hsl(120,100%,55%) 50%, hsl(0,100%,55%) 100%)",
            }}
          />
          <div className="mt-1 flex items-center justify-between text-[9px] font-mono tabular-nums text-white">
            <span>{heatStats.min}</span>
            <span className="text-muted">AVG {heatStats.avg}</span>
            <span>{heatStats.max}</span>
          </div>
        </div>
      )}

      {outline.source === "layout" && (
        <div
          className="absolute top-14 right-2 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/80 border border-[#38383f]"
          style={{
            background: overlayBackground,
            backdropFilter: "blur(4px)",
          }}
          title="Using coarse circuit layout fallback because baked geometry and GPS outline data were unavailable"
        >
          Fallback layout
        </div>
      )}

      {/* Bottom-left overlay: weather */}
      {weatherOverlay ? (
        <div
          className={`absolute bottom-2 left-2 hidden md:block pointer-events-none border border-panel border-l-2 px-2 py-1.5 ${weatherOverlayClass}`}
          style={{
            minWidth: 184,
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-muted">
            <CloudRain size={10} strokeWidth={2.2} aria-hidden="true" />
            Track Weather
            {weatherOverlay.rainfall > 0 && (
              <span className="ml-auto inline-flex items-center rounded-sm bg-sky-600/85 px-1 py-0.5 text-[7px] font-black tracking-[0.12em] text-white">
                Rain
              </span>
            )}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-muted">
                  <Thermometer size={9} strokeWidth={2.1} aria-hidden="true" />
                  Track
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white text-right">
                  {toDisplayTemperature(
                    weatherOverlay.track_temperature,
                    metricSystem,
                  ).toFixed(1)}{" "}
                  {tempUnit}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-muted">
                  <Droplets size={9} strokeWidth={2.1} aria-hidden="true" />
                  Hum
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white text-right">
                  {weatherOverlay.humidity}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-muted">
                  <Wind size={9} strokeWidth={2.1} aria-hidden="true" />
                  Wind
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white text-right">
                  {toDisplayWindSpeed(
                    weatherOverlay.wind_speed,
                    metricSystem,
                  ).toFixed(1)}{" "}
                  {windUnit}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-muted">
                  <Thermometer size={9} strokeWidth={2.1} aria-hidden="true" />
                  Air
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white text-right">
                  {toDisplayTemperature(
                    weatherOverlay.air_temperature,
                    metricSystem,
                  ).toFixed(1)}{" "}
                  {tempUnit}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-muted">
                  <Gauge size={9} strokeWidth={2.1} aria-hidden="true" />
                  Press
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white text-right">
                  {weatherOverlay.pressure.toFixed(0)} hPa
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] uppercase tracking-[0.12em] text-muted">
                  Dir/Rain
                </span>
                <span className="text-[10px] font-mono tabular-nums text-right">
                  <span className="text-white">
                    {windDir(weatherOverlay.wind_direction)}
                  </span>
                  <span className="text-muted"> / </span>
                  <span
                    className={
                      weatherOverlay.rainfall > 0
                        ? "text-[#7dd3fc]"
                        : "text-muted"
                    }
                  >
                    {weatherOverlay.rainfall > 0 ? "YES" : "NO"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Focused-driver HUD — speed / gear / throttle + brake bars */}
      {showFocusedHud &&
        hudData &&
        focusDriver !== null &&
        (() => {
          const driver = driverByNumber.get(focusDriver);
          const color = teamColor(driver?.team_colour);
          return (
            <div
              className="absolute top-2 left-2 pointer-events-none flex flex-col gap-1 px-2 py-1.5"
              style={{
                background: hudBackground,
                backdropFilter: "blur(4px)",
                minWidth: 100,
                border: `1px solid ${color}33`,
              }}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[22px] font-black tabular-nums leading-none"
                  style={{ color }}
                >
                  {Math.round(toDisplaySpeed(hudData.speed, metricSystem))}
                </span>
                <span className="text-[9px] text-muted uppercase tracking-widest leading-none self-end pb-0.5">
                  {speedUnit}
                </span>
                <span
                  className="ml-auto text-[18px] font-black tabular-nums leading-none"
                  style={{ color: hudData.n_gear === 0 ? "#ff5252" : color }}
                >
                  {hudData.n_gear === 0 ? "N" : hudData.n_gear}
                </span>
              </div>
              {/* Throttle bar */}
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-muted w-5 shrink-0">THR</span>
                <div className="flex-1 h-1.5 bg-panel rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-[#39b54a] rounded-sm transition-none"
                    style={{ width: `${hudData.throttle}%` }}
                  />
                </div>
              </div>
              {/* Brake bar */}
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-muted w-5 shrink-0">BRK</span>
                <div className="flex-1 h-1.5 bg-panel rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-f1red rounded-sm transition-none"
                    style={{ width: `${hudData.brake}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

      {/* PNG export — only shown when there is track + car data to capture */}
      {locationIndexes.size > 0 && (
        <div className="absolute bottom-2 right-2 z-20 flex flex-row items-end gap-2">
          {showSectorBox && hasTrackConditionDisplay && (
            <div
              className="flex flex-col gap-px"
              style={{ backdropFilter: "blur(4px)" }}
            >
              <div
                className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-muted text-center"
                style={{ background: overlayBackground }}
              >
                Sectors
              </div>
              <div className="flex gap-px">
                {([1, 2, 3] as const).map((sectorNum) => {
                  const flag = effectiveFlagForSector(sectorNum);
                  const color = flag
                    ? (flagPalette[flag]?.color ?? "#6b6b7a")
                    : "#2e2e3a";
                  return (
                    <div
                      key={`sector-chip-${sectorNum}`}
                      className="flex flex-col items-center justify-center px-2 py-1 border border-[#38383f]"
                      style={{
                        background: flag ? `${color}22` : overlayBackground,
                        borderColor: flag ? `${color}66` : "#38383f",
                        minWidth: 34,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full mb-0.5"
                        style={{ background: color }}
                      />
                      <span className="text-[8px] font-black uppercase text-white/70">
                        S{sectorNum}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-col items-end gap-1">
            {showCompass && (
              <div
                className="w-[46px] h-12 bg-[#15151e]/85 flex items-center justify-center"
                title="Compass"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="46"
                  height="46"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="8.5"
                    fill="none"
                    stroke="#6b6b7a"
                    strokeWidth="0.8"
                  />
                  <text
                    x="12"
                    y="2.8"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="3.2"
                    fontWeight="900"
                  >
                    N
                  </text>
                  <text
                    x="12"
                    y="23"
                    textAnchor="middle"
                    fill="#8c8ca0"
                    fontSize="2.5"
                    fontWeight="700"
                  >
                    S
                  </text>
                  <text
                    x="1.9"
                    y="12.9"
                    textAnchor="middle"
                    fill="#8c8ca0"
                    fontSize="2.5"
                    fontWeight="700"
                  >
                    W
                  </text>
                  <text
                    x="22.1"
                    y="12.9"
                    textAnchor="middle"
                    fill="#8c8ca0"
                    fontSize="2.5"
                    fontWeight="700"
                  >
                    E
                  </text>
                  <line
                    x1="12"
                    y1="3.7"
                    x2="12"
                    y2="20.3"
                    stroke="#4f5061"
                    strokeWidth="0.45"
                  />
                  <line
                    x1="3.7"
                    y1="12"
                    x2="20.3"
                    y2="12"
                    stroke="#4f5061"
                    strokeWidth="0.45"
                  />
                  <g transform={`rotate(${-rotationDeg} 12 12)`}>
                    <path
                      d="M12 4.6 L13.8 12 L12 10.6 L10.2 12 Z"
                      fill="#ff2d4d"
                    />
                    <path
                      d="M12 19.4 L13.4 12 L12 13.1 L10.6 12 Z"
                      fill="#5f6175"
                    />
                    <circle cx="12" cy="12" r="1.1" fill="#d4d4df" />
                  </g>
                </svg>
              </div>
            )}
            {showTrackScreenshot && (
              <button
                onClick={() =>
                  svgRef.current && exportTrackSnapshot(svgRef.current)
                }
                className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-[#1e1e2a]/80 border border-[#38383f] text-muted hover:text-white hover:border-white/30 transition-colors backdrop-blur-sm"
                title="Download track snapshot as PNG"
              >
                ↓ PNG
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
