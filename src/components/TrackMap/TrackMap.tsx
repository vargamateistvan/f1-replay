import { useMemo, useState, useEffect, useRef } from "react";
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
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useTrackOutline, locationToSvg } from "@/hooks/useTrackMap";
import { buildIndex, interpolateXY } from "@/timeline/interpolate";
import { useTimeline } from "@/timeline/clock";
import { teamColor } from "@/utils/color";
import { useSettings } from "@/stores/settings";
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

export interface LeaderboardRow {
  num: number;
  pos: number;
  acronym: string;
  color: string;
  gap: string;
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
  readonly leaderboard?: readonly LeaderboardRow[];
  readonly weatherOverlay?: Weather | null;
  readonly activeSectorFlag?: ActiveTrackFlag | null;
  readonly activeTrackFlagState?: ActiveTrackFlagState | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly showSectorBox?: boolean;
  readonly showTrackControls?: boolean;
  readonly showCompass?: boolean;
  readonly showFocusedHud?: boolean;
  readonly showTrackScreenshot?: boolean;
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
  leaderboard,
  weatherOverlay = null,
  activeSectorFlag = null,
  activeTrackFlagState = null,
  activeTrackVehicles = null,
  showSectorBox = true,
  showTrackControls = true,
  showCompass = true,
  showFocusedHud = true,
  showTrackScreenshot = true,
  onSelectDriver,
}: Props) {
  const { t } = useTimeline();
  const lightMode = useSettings((s) => s.lightMode);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);

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

  useEffect(() => {
    setZoomLevel(1);
    setRotationDeg(0);
  }, [sessionKey, circuitKey]);

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

  // Fetch telemetry for the focused driver's last completed lap.
  // Only fires when a driver is focused and a lap number is known; result is
  // cached forever (staleTime: Infinity) so lap changes cost one extra API call.
  const heatData = useCarDataForLap(
    sessionKey,
    focusDriver,
    focusDriverLap ?? null,
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

  const svgRef = useRef<SVGSVGElement>(null);

  if (!sessionKey) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        Select a session to load the track
      </div>
    );
  }

  if (isPending) {
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

  // Follow-cam: zoom in on the focused driver, clamped to the SVG boundary.
  let viewX = 0;
  let viewY = 0;
  let viewW = SVG_W;
  let viewH = SVG_H;
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
      const vx = Math.max(
        0,
        Math.min(SVG_W - FOLLOW_ZOOM_W, cx - FOLLOW_ZOOM_W / 2),
      );
      const vy = Math.max(
        0,
        Math.min(SVG_H - FOLLOW_ZOOM_H, cy - FOLLOW_ZOOM_H / 2),
      );
      viewX = vx;
      viewY = vy;
      viewW = FOLLOW_ZOOM_W;
      viewH = FOLLOW_ZOOM_H;
    }
  }

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

  return (
    <div className="relative w-full h-full">
      {activeTrackVehicles &&
        (activeTrackVehicles.safetyCar ||
          activeTrackVehicles.vsc ||
          activeTrackVehicles.medicalCar ||
          activeTrackVehicles.formationLap) && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1.5">
            {activeTrackVehicles.formationLap && (
              <span className="border border-[#2d3550] bg-[#1c1c2e] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#c8c8ff]">
                Formation Lap
              </span>
            )}
            {activeTrackVehicles.safetyCar && (
              <span className="border border-[#704600] bg-[#f5a623] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-black/90">
                Safety Car
              </span>
            )}
            {activeTrackVehicles.vsc && (
              <span className="border border-[#7a5400] bg-[#ffd166] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-black/90">
                VSC
              </span>
            )}
            {activeTrackVehicles.medicalCar && (
              <span className="border border-[#5f121d] bg-[#e8002d] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-white">
                Medical Car
              </span>
            )}
          </div>
        )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full"
        style={{ background: mapBackground }}
      >
        <defs>
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
          {/* Track surface: thick grey base + thin white highlight */}
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

          {/* Sectors + DRS overlays (session-static, memoized) */}
          {staticOverlays}

          {/* Marshal sector dots (baked geometry only) */}
          {marshalSectorOverlays}

          {/* Active flag tint over marshal sectors / sector boxes */}
          {sectorFlagTints}

          {/* Corner numbers (baked geometry only) */}
          {cornerOverlays}

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
              const showLabel = focusDriver === null || focused;
              const pulsing = pulseSet.has(num);
              const isBattling = battlingDrivers?.has(num) ?? false;
              const compoundInfo = activeCompounds?.get(num);
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
                      r={9}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                    />
                  )}
                  <circle
                    r={focused ? 6.5 : 4.5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={focused ? 1.6 : 1.2}
                    strokeOpacity={focused ? 0.9 : 0.6}
                  />
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
                      x={focused ? 10 : 7}
                      y={-5}
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

          {/* No-data hint */}
          {locationIndexes.size === 0 && (
            <text
              x={SVG_W / 2}
              y={SVG_H / 2}
              textAnchor="middle"
              fill="#636369"
              fontSize={11}
              fontFamily="Inter, sans-serif"
            >
              Press ▶ to start replay
            </text>
          )}
        </g>
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
              onClick={() => setRotationDeg((r) => r - 15)}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Rotate left"
            >
              <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setRotationDeg((r) => r + 15)}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Rotate right"
            >
              <RotateCw size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setRotationDeg(0)}
              className="w-7 h-7 flex items-center justify-center border border-[#4b4b57] text-white/85 hover:text-white hover:border-white/50 transition-colors"
              title="Reset rotation"
            >
              <LocateFixed size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
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

      {/* Bottom-left overlay: weather (preferred) or top-5 leaderboard fallback */}
      {weatherOverlay ? (
        <div
          className={`absolute bottom-2 left-2 pointer-events-none border border-panel border-l-2 px-2 py-1.5 ${weatherOverlayClass}`}
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
                  {weatherOverlay.track_temperature.toFixed(1)} C
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
                  {weatherOverlay.wind_speed.toFixed(1)} m/s
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
                  {weatherOverlay.air_temperature.toFixed(1)} C
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
      ) : (
        leaderboard &&
        leaderboard.length > 0 && (
          <div
            className="absolute bottom-2 left-2 flex flex-col gap-px pointer-events-none"
            style={{ minWidth: 110 }}
          >
            {leaderboard.map((row) => (
              <div
                key={row.num}
                className="flex items-center gap-1.5 px-1.5 py-0.5"
                style={{
                  background: overlayBackground,
                  backdropFilter: "blur(4px)",
                }}
              >
                <span className="text-[9px] font-black tabular-nums text-muted w-4 text-right shrink-0">
                  {row.pos}
                </span>
                <span
                  className="w-[2px] self-stretch shrink-0 rounded-sm"
                  style={{ background: row.color }}
                />
                <span
                  className="text-[10px] font-black uppercase tracking-wide flex-1"
                  style={{ color: row.color }}
                >
                  {row.acronym}
                </span>
                <span className="text-[9px] font-mono tabular-nums text-muted shrink-0">
                  {row.gap}
                </span>
              </div>
            ))}
          </div>
        )
      )}

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
                  {hudData.speed}
                </span>
                <span className="text-[9px] text-muted uppercase tracking-widest leading-none self-end pb-0.5">
                  km/h
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
