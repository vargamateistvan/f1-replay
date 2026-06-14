import { useMemo, useState, useEffect, useRef } from "react";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { useTrackOutline, locationToSvg } from "@/hooks/useTrackMap";
import { buildIndex, interpolateXY } from "@/timeline/interpolate";
import { useTimeline } from "@/timeline/clock";
import { teamColor } from "@/utils/color";
import type { Driver, Location, Stint } from "@/api/types";
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

// Speed → HSL color: 0 km/h = blue (240°), 150 = green (120°), 300+ = red (0°).
// Matches the F1 broadcast "speed trace" convention.
function speedToColor(speed: number): string {
  const hue = Math.round(240 - Math.min(speed / 300, 1) * 240);
  return `hsl(${hue},100%,55%)`;
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
    if (!ctx) { URL.revokeObjectURL(url); return; }
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

interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly focusDriver?: number | null;
  readonly pulseDrivers?: readonly number[];
  readonly circuitShortName?: string | null;
  readonly activeCompounds?: ReadonlyMap<number, { compound: Stint["compound"]; age: number }>;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly focusDriverLap?: number | null;
  readonly leaderboard?: readonly LeaderboardRow[];
  readonly activeSectorFlag?: string | null;
}

export function TrackMap({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  focusDriver = null,
  pulseDrivers,
  circuitShortName,
  activeCompounds,
  battlingDrivers,
  focusDriverLap = null,
  leaderboard,
  activeSectorFlag = null,
}: Props) {
  // TrackMap owns its t subscription so the animation loop is isolated here
  const { t } = useTimeline();

  // Try drivers in order until one yields a valid track outline. A driver who
  // retired on lap 1 may have no clean laps; trying the next avoids a blank map.
  const [driverFallbackIdx, setDriverFallbackIdx] = useState(0);
  useEffect(() => {
    setDriverFallbackIdx(0);
  }, [sessionKey]);

  const candidateDriver = drivers[driverFallbackIdx] ?? drivers[0] ?? null;
  const { data: outline, isPending } = useTrackOutline(
    sessionKey,
    candidateDriver?.driver_number ?? null,
  );

  // If this driver has no valid laps and there are more to try, advance the index.
  useEffect(() => {
    if (!isPending && outline === null && driverFallbackIdx < drivers.length - 1) {
      setDriverFallbackIdx((i) => i + 1);
    }
  }, [outline, isPending, driverFallbackIdx, drivers.length]);

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
      let lo = 0, hi = samples.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (samples[mid]!.distM < targetDist) lo = mid + 1;
        else hi = mid;
      }
      const sample = samples[lo] ?? samples[samples.length - 1]!;
      return { x1: pt.sx, y1: pt.sy, x2: svgPts[i + 1]!.sx, y2: svgPts[i + 1]!.sy, speed: sample.speed };
    });
  }, [trackGeometry, heatData.data]);

  // Memoize sector + DRS overlay elements — pure geometry, session-static.
  const staticOverlays = useMemo(() => {
    if (!trackGeometry || !circuitLayout) return null;
    const { bounds, innerW, innerH } = trackGeometry;
    return (
      <>
        {circuitLayout.sectors.map((sector) => {
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
            <g key={`sector-${sector.number}`} opacity={0.15}>
              <rect x={x} y={y} width={w} height={h} fill={SECTOR_COLORS[sector.number]} />
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
        })}
        {circuitLayout.drsZones.map((zone, idx) => {
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
        })}
      </>
    );
  }, [trackGeometry, circuitLayout]);

  // Flag tint overlaid on top of sector boxes when a flag is active.
  // Separate from staticOverlays so flag changes don't regenerate the static geometry.
  const sectorFlagTints = useMemo(() => {
    if (!trackGeometry || !circuitLayout || !activeSectorFlag) return null;
    const TINT: Record<string, string> = {
      YELLOW:        '#f5d400',
      DOUBLE_YELLOW: '#f5d400',
      RED:           '#e8002d',
      SAFETY_CAR:    '#f5a623',
      VIRTUAL_SC:    '#f5a623',
      GREEN:         '#39b54a',
    };
    const tint = TINT[activeSectorFlag];
    if (!tint) return null;
    const { bounds, innerW, innerH } = trackGeometry;
    return (
      <>
        {circuitLayout.sectors.map((sector) => {
          const { sx: sx1, sy: sy1 } = locationToSvg(sector.bounds.minX, sector.bounds.minY, bounds, innerW, innerH);
          const { sx: sx2, sy: sy2 } = locationToSvg(sector.bounds.maxX, sector.bounds.maxY, bounds, innerW, innerH);
          const x = Math.min(sx1, sx2) + PAD;
          const y = Math.min(sy1, sy2) + PAD;
          const w = Math.abs(sx2 - sx1);
          const h = Math.abs(sy2 - sy1);
          return <rect key={`flag-tint-${sector.number}`} x={x} y={y} width={w} height={h} fill={tint} opacity={0.28} />;
        })}
      </>
    );
  }, [trackGeometry, circuitLayout, activeSectorFlag]);

  // Current-moment car telemetry for the focused driver — binary search on date.
  // Runs at 60 fps but O(log n) on ~1000-sample arrays so cost is negligible.
  const hudData = useMemo(() => {
    if (focusDriver === null || !heatData.data?.length) return null;
    const data = heatData.data;
    const targetMs = sessionStartMs + t;
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (new Date(data[mid]!.date).getTime() < targetMs) lo = mid + 1;
      else hi = mid;
    }
    const sample = data[lo] ?? data[data.length - 1]!;
    const diff = Math.abs(new Date(sample.date).getTime() - targetMs);
    return diff < 120_000 ? sample : null;
  }, [heatData.data, sessionStartMs, t, focusDriver]);

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
    const pos = interpolateXY(idx, t);
    if (pos) carPositions.push({ num, ...pos });
  }

  const pulseSet = new Set(pulseDrivers ?? []);
  const svgRef = useRef<SVGSVGElement>(null);

  // Follow-cam: zoom in on the focused driver, clamped to the SVG boundary.
  let viewBox = `0 0 ${SVG_W} ${SVG_H}`;
  if (focusDriver !== null) {
    const focusedPos = carPositions.find((c) => c.num === focusDriver);
    if (focusedPos) {
      const { sx, sy } = locationToSvg(focusedPos.x, focusedPos.y, bounds, innerW, innerH);
      const cx = sx + PAD;
      const cy = sy + PAD;
      const vx = Math.max(0, Math.min(SVG_W - FOLLOW_ZOOM_W, cx - FOLLOW_ZOOM_W / 2));
      const vy = Math.max(0, Math.min(SVG_H - FOLLOW_ZOOM_H, cy - FOLLOW_ZOOM_H / 2));
      viewBox = `${vx.toFixed(1)} ${vy.toFixed(1)} ${FOLLOW_ZOOM_W} ${FOLLOW_ZOOM_H}`;
    }
  }

  return (
    <div className="relative w-full h-full">
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className="w-full h-full"
      style={{ background: "#15151e" }}
    >
      {/* Track surface: thick grey base + thin white highlight */}
      <path
        d={pathData}
        fill="none"
        stroke="#38383f"
        strokeWidth={11}
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

      {/* Speed heat overlay — shown when a driver is focused and lap data is loaded.
          Segments are colored blue (slow) → green → red (fast) by the driver's
          recorded speed at each track position on their last completed lap. */}
      {heatSegments.length > 0 && heatSegments.map((seg, i) => (
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

      {/* Active flag tint over sector boxes */}
      {sectorFlagTints}

      {/* Car dots — when a driver is focused, dim the rest and enlarge the pick */}
      {carPositions
        .slice()
        .sort(
          (a, b) =>
            (a.num === focusDriver ? 1 : 0) - (b.num === focusDriver ? 1 : 0),
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
                <circle r={6} fill="none" stroke="#ffffff" strokeWidth={1.5}>
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
                  stroke="#15151e"
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
    </svg>

    {/* Mini-leaderboard — top-5 positions pinned to bottom-left */}
    {leaderboard && leaderboard.length > 0 && (
      <div className="absolute bottom-2 left-2 flex flex-col gap-px pointer-events-none" style={{ minWidth: 110 }}>
        {leaderboard.map((row) => (
          <div
            key={row.num}
            className="flex items-center gap-1.5 px-1.5 py-0.5"
            style={{ background: 'rgba(21,21,30,0.82)', backdropFilter: 'blur(4px)' }}
          >
            <span className="text-[9px] font-black tabular-nums text-muted w-4 text-right shrink-0">
              {row.pos}
            </span>
            <span className="w-[2px] self-stretch shrink-0 rounded-sm" style={{ background: row.color }} />
            <span className="text-[10px] font-black uppercase tracking-wide flex-1" style={{ color: row.color }}>
              {row.acronym}
            </span>
            <span className="text-[9px] font-mono tabular-nums text-muted shrink-0">
              {row.gap}
            </span>
          </div>
        ))}
      </div>
    )}

    {/* Focused-driver HUD — speed / gear / throttle + brake bars */}
    {hudData && focusDriver !== null && (() => {
      const driver = driverByNumber.get(focusDriver);
      const color = teamColor(driver?.team_colour);
      return (
        <div
          className="absolute top-2 left-2 pointer-events-none flex flex-col gap-1 px-2 py-1.5"
          style={{ background: 'rgba(21,21,30,0.85)', backdropFilter: 'blur(4px)', minWidth: 100, border: `1px solid ${color}33` }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-black tabular-nums leading-none" style={{ color }}>
              {hudData.speed}
            </span>
            <span className="text-[9px] text-muted uppercase tracking-widest leading-none self-end pb-0.5">km/h</span>
            <span
              className="ml-auto text-[18px] font-black tabular-nums leading-none"
              style={{ color: hudData.n_gear === 0 ? '#ff5252' : color }}
            >
              {hudData.n_gear === 0 ? 'N' : hudData.n_gear}
            </span>
          </div>
          {/* Throttle bar */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-muted w-5 shrink-0">THR</span>
            <div className="flex-1 h-1.5 bg-panel rounded-sm overflow-hidden">
              <div className="h-full bg-[#39b54a] rounded-sm transition-none" style={{ width: `${hudData.throttle}%` }} />
            </div>
          </div>
          {/* Brake bar */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-muted w-5 shrink-0">BRK</span>
            <div className="flex-1 h-1.5 bg-panel rounded-sm overflow-hidden">
              <div className="h-full bg-f1red rounded-sm transition-none" style={{ width: `${hudData.brake}%` }} />
            </div>
          </div>
        </div>
      );
    })()}

    {/* PNG export — only shown when there is track + car data to capture */}
    {locationIndexes.size > 0 && (
      <button
        onClick={() => svgRef.current && exportTrackSnapshot(svgRef.current)}
        className="absolute bottom-2 right-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-[#1e1e2a]/80 border border-[#38383f] text-muted hover:text-white hover:border-white/30 transition-colors backdrop-blur-sm"
        title="Download track snapshot as PNG"
      >
        ↓ PNG
      </button>
    )}
    </div>
  );
}
