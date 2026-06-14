import { useMemo, useState, useEffect, useRef } from "react";
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
    return { pathData, bounds, innerW, innerH };
  }, [outline]);

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

      {/* Sectors + DRS overlays (session-static, memoized) */}
      {staticOverlays}

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
