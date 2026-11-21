import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@/api/types";
import type { PitLanePath } from "@/data/pitLanes";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useCachedSimulationDrivers } from "@/hooks/useSession";
import { useSettings } from "@/stores/settings";
import { MapBackground } from "../TrackMap/layers/MapBackground";
import {
  DirectionArrows,
  SectorBoundaryMarkers,
  StartFinishLine,
  TrackSurface,
  TrackSurfaceGradient,
} from "../TrackMap/layers/TrackSurfaceLayers";
import type { TrackGeometry } from "../TrackMap/trackGeometry";
import { TOKEN_HEX, TOKEN_HEX_LIGHT } from "@/designTokens";
import { circuitThumbnail } from "@/utils/circuitInfo";
import { teamColor } from "@/utils/color";
import {
  FLAG_COLORS,
  SESSION_SIMULATION_CARS,
  SESSION_SIMULATION_INCIDENT_WEIGHTS,
  SESSION_SIMULATION_LAP_SECONDS,
  SESSION_SIMULATION_LAP_STEP_SECONDS,
  SESSION_SIMULATION_MAX_STEP_S,
  SESSION_SIMULATION_PIT_MAX_OFFSET,
  SESSION_SIMULATION_PREVIEW_COLORS,
  SESSION_SIMULATION_RED_PACE_CHANGE_S,
  SESSION_SIMULATION_RED_S,
  SESSION_SIMULATION_SC_FIRST_DELAY_S,
  SESSION_SIMULATION_SC_INTERVAL_S,
  SESSION_SIMULATION_SC_LAP_FACTOR,
  SESSION_SIMULATION_SC_LAPS,
  SESSION_SIMULATION_SC_MIN_QUEUE_SPEED,
  SESSION_SIMULATION_SC_PIT_SECONDS,
  SESSION_SIMULATION_SC_QUEUE_GAP,
  SESSION_SIMULATION_YELLOW_S,
  SESSION_SIMULATION_YELLOW_SPEED,
  SESSION_SIMULATION_YELLOW_ZONE,
  TRACK_SURFACE_ASPHALT_WIDTH,
  TRACK_SVG_H,
  TRACK_SVG_PAD,
  TRACK_SVG_W,
} from "@/constants";
import {
  buildPolyline,
  createSimulation,
  nearestFraction,
  pointAt,
  stepSimulation,
  type Polyline,
  type PolylinePosition,
  type SimConfig,
  type SimPhase,
  type SimState,
  type YellowZone,
} from "./simulationModel";

// Fast and slow cars alternate around the lap so faster cars catch the car ahead.
const SIMULATION_LAP_SECONDS = Array.from({ length: SESSION_SIMULATION_CARS }, (_, index) => {
  const paceRank = index % 2 === 0
    ? index / 2
    : SESSION_SIMULATION_CARS - 1 - Math.floor(index / 2);
  return SESSION_SIMULATION_LAP_SECONDS + paceRank * SESSION_SIMULATION_LAP_STEP_SECONDS;
});

const START_POSITIONS = SIMULATION_LAP_SECONDS.map((_, index) => index / SESSION_SIMULATION_CARS);

const FLAG_BANNERS: Partial<Record<SimPhase, { label: string; className: string }>> = {
  deploying: { label: "Safety car", className: "border-orange-line bg-orange-tint text-orange-fg" },
  "safety-car": { label: "Safety car", className: "border-orange-line bg-orange-tint text-orange-fg" },
  returning: { label: "Safety car in", className: "border-orange-line bg-orange-tint text-orange-fg" },
  yellow: { label: "Yellow flag", className: "border-yellow-line bg-yellow-tint text-yellow-fg" },
  red: { label: "Red flag", className: "border-red-line bg-red-tint text-red-fg" },
};

function zonePath(track: Polyline, zone: YellowZone): string {
  const samples = Math.max(2, Math.ceil(zone.length * 120));
  return Array.from({ length: samples + 1 }, (_, i) => {
    const p = pointAt(track, zone.start + (zone.length * i) / samples);
    return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join("");
}

/** The simulation outline as the 2D map's track geometry, so its layers can draw it. */
function outlineGeometry(path: string, points: readonly { x: number; y: number }[]): TrackGeometry {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  }
  const total = lengths[lengths.length - 1] || 1;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return {
    pathData: path,
    bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
    innerW: TRACK_SVG_W - TRACK_SVG_PAD * 2,
    innerH: TRACK_SVG_H - TRACK_SVG_PAD * 2,
    svgPts: points.map((p) => ({ sx: p.x, sy: p.y })),
    normArc: lengths.map((l) => l / total),
  };
}

const carTransform = ({ x, y, angle }: PolylinePosition) =>
  `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`;

function CarShape() {
  return (
    <g transform="rotate(90)">
      <path d="M-3-7H3V-5H1.5L2-2V3L3 5V7H-3V5L-2 3V-2L-1.5-5H-3Z" fill="currentColor" />
      <path d="M-4-4H-2V-1H-4ZM2-4H4V-1H2ZM-4 3H-2V6H-4ZM2 3H4V6H2Z" className="fill-sunken stroke-muted" strokeWidth={0.4} />
      <path d="M-3 6H3M-3-6H3" className="stroke-fg" strokeWidth={0.6} />
      <ellipse cy={1} rx={0.9} ry={1.5} className="fill-sunken" />
    </g>
  );
}

function SafetyCarShape() {
  return (
    <g transform="rotate(90)">
      <rect x={-3.5} y={-7} width={7} height={14} rx={2} fill={FLAG_COLORS.SAFETY_CAR} />
      <rect x={-2.5} y={-2} width={5} height={4} rx={0.8} className="fill-sunken" />
      <path d="M-2.5-1H2.5" className="stroke-yellow" strokeWidth={1} />
    </g>
  );
}

/** Pit lane in the outline's frame, with where it leaves and rejoins the track. */
function pitRoute(
  lane: PitLanePath | null,
  track: Polyline | null,
  project: ((x: number, y: number) => { x: number; y: number }) | undefined,
) {
  if (!lane || !track || !project || lane.x.length < 2 || lane.x.length !== lane.y.length) return null;
  const line = buildPolyline(lane.x.map((x, i) => project(x, lane.y[i]!)), false);
  if (!line) return null;
  const entry = nearestFraction(track, line.points[0]!);
  const exit = nearestFraction(track, line.points[line.points.length - 1]!);
  if (Math.max(entry.distance, exit.distance) > SESSION_SIMULATION_PIT_MAX_OFFSET) return null;
  return {
    line,
    path: line.points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(""),
    entryFraction: entry.fraction,
    exitFraction: exit.fraction,
  };
}

function safetyCarPosition(
  state: SimState,
  track: Polyline,
  pit: ReturnType<typeof pitRoute>,
): PolylinePosition | null {
  if (state.phase === "safety-car") return pointAt(track, state.safetyCar);
  if (!pit) return null;
  // Out from the garage (mid lane) to the exit; back in from the entry to the garage.
  if (state.phase === "deploying") return pointAt(pit.line, 0.5 + state.pitProgress / 2);
  if (state.phase === "returning") return pointAt(pit.line, state.pitProgress / 2);
  return null;
}

export function SessionSimulation({
  session,
  variant = "background",
}: {
  session: (Pick<Session, "date_start" | "circuit_key" | "year" | "circuit_short_name"> &
    Partial<Pick<Session, "session_key">>) | undefined;
  variant?: "background" | "preview";
}) {
  const { data: geometry } = useCircuitGeometry(session?.circuit_key, session?.year);
  const drivers = useCachedSimulationDrivers(session);
  const colors = useMemo(
    () => [...new Set(
      drivers?.filter((driver) => driver.team_colour)
        .map((driver) => teamColor(driver.team_colour)),
    )],
    [drivers],
  );
  const carColors = colors.length ? colors :
    variant === "preview" ? SESSION_SIMULATION_PREVIEW_COLORS : colors;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const outline = useMemo(
    () => geometry
      ? circuitThumbnail(geometry, TRACK_SVG_W, TRACK_SVG_H, TRACK_SVG_PAD, 0)
      : null,
    [geometry],
  );
  const track = useMemo(() => outline ? buildPolyline(outline.points, true) : null, [outline]);
  const geom = useMemo(() => outline ? outlineGeometry(outline.path, outline.points) : null, [outline]);
  const lightMode = useSettings((s) => s.lightMode);
  const showKerbs = useSettings((s) => s.mapShowKerbs);
  const showSectorMarkers = useSettings((s) => s.mapShowSectorMarkers);
  const idSuffix = `${session?.circuit_key ?? "na"}-${variant}`;

  // Loaded on demand so the baked pit lanes stay out of the Home chunk.
  const circuitKey = session?.circuit_key;
  const [pitLane, setPitLane] = useState<PitLanePath | null>(null);
  useEffect(() => {
    setPitLane(null);
    if (circuitKey == null) return;
    let cancelled = false;
    import("@/data/pitLanes")
      .then(({ getPitLane }) => { if (!cancelled) setPitLane(getPitLane(circuitKey)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [circuitKey]);
  const pit = useMemo(() => pitRoute(pitLane, track, outline?.project), [pitLane, track, outline]);

  const config = useMemo<SimConfig | null>(() => track ? {
    carLapSeconds: SIMULATION_LAP_SECONDS,
    catchLapSeconds: SESSION_SIMULATION_LAP_SECONDS,
    safetyCarLapSeconds: SESSION_SIMULATION_LAP_SECONDS * SESSION_SIMULATION_SC_LAP_FACTOR,
    pitExitFraction: pit?.exitFraction ?? 0,
    pitEntryFraction: pit?.entryFraction ?? 0,
    pitSeconds: pit ? SESSION_SIMULATION_SC_PIT_SECONDS : 0,
    queueGap: SESSION_SIMULATION_SC_QUEUE_GAP / track.length,
    minQueueSpeed: SESSION_SIMULATION_SC_MIN_QUEUE_SPEED,
    firstDelaySeconds: SESSION_SIMULATION_SC_FIRST_DELAY_S,
    intervalSeconds: SESSION_SIMULATION_SC_INTERVAL_S,
    safetyCarLaps: SESSION_SIMULATION_SC_LAPS,
    incidentWeights: SESSION_SIMULATION_INCIDENT_WEIGHTS,
    yellowSeconds: SESSION_SIMULATION_YELLOW_S,
    yellowZoneLength: SESSION_SIMULATION_YELLOW_ZONE,
    yellowSpeed: SESSION_SIMULATION_YELLOW_SPEED,
    redSeconds: SESSION_SIMULATION_RED_S,
    paceChangeSeconds: SESSION_SIMULATION_RED_PACE_CHANGE_S,
  } : null, [track, pit]);

  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const safetyCarRef = useRef<SVGGElement | null>(null);
  const [incident, setIncident] = useState<{ phase: SimPhase; zone: YellowZone | null }>(
    { phase: "green", zone: null },
  );

  useEffect(() => {
    if (!track || !config || reducedMotion) return;
    const state = createSimulation(config);
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now) {
      const dt = last == null ? 0 : Math.min(SESSION_SIMULATION_MAX_STEP_S, (now - last) / 1000);
      last = now;
      stepSimulation(state, config, dt);
      state.cars.forEach((pos, index) => {
        carRefs.current[index]?.setAttribute("transform", carTransform(pointAt(track, pos)));
      });
      const sc = safetyCarPosition(state, track, pit);
      const scEl = safetyCarRef.current;
      if (scEl) {
        scEl.style.display = sc ? "" : "none";
        if (sc) scEl.setAttribute("transform", carTransform(sc));
      }
      setIncident((current) => current.phase === state.phase && current.zone === state.yellowZone
        ? current
        : { phase: state.phase, zone: state.yellowZone });
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      setIncident({ phase: "green", zone: null });
    };
  }, [track, config, pit, reducedMotion]);

  if (!outline || !track || !geom) return null;
  const banner = reducedMotion ? undefined : FLAG_BANNERS[incident.phase];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-4 top-4 flex items-center gap-2 font-mono text-caption uppercase tracking-caps text-muted">
        <span>{session?.circuit_short_name} · Simulation · Not live data</span>
        {banner && (
          <span
            data-simulation-flag-banner={incident.phase}
            className={`rounded-sm border px-1.5 ${banner.className}`}
          >
            {banner.label}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${TRACK_SVG_W} ${TRACK_SVG_H}`}
        className={`h-full w-full ${variant === "preview" ? "opacity-100" : "opacity-40"}`}
        aria-hidden="true"
      >
        <defs>
          <TrackSurfaceGradient id={`sim-asphalt-${idSuffix}`} lightMode={lightMode} />
          <pattern id={`sim-checker-${idSuffix}`} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="4" height="4" fill={TOKEN_HEX.white} />
            <rect x="0" y="0" width="2" height="2" fill={TOKEN_HEX_LIGHT.fg} />
            <rect x="2" y="2" width="2" height="2" fill={TOKEN_HEX_LIGHT.fg} />
          </pattern>
        </defs>
        <MapBackground view={{ x: 0, y: 0, w: TRACK_SVG_W, h: TRACK_SVG_H }} lightMode={lightMode} />
        <g data-simulation-track="">
          <TrackSurface geom={geom} gradientId={`sim-asphalt-${idSuffix}`} lightMode={lightMode} showKerbs={showKerbs} />
        </g>
        {pit && (
          <path
            data-simulation-pit-lane=""
            d={pit.path}
            fill="none"
            stroke={lightMode ? TOKEN_HEX_LIGHT.fg : TOKEN_HEX.fg}
            strokeOpacity={0.6}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {!reducedMotion && incident.phase === "red" && (
          <path data-simulation-red-flag="" d={outline.path} fill="none" className="stroke-red" strokeOpacity={0.45} strokeWidth={TRACK_SURFACE_ASPHALT_WIDTH} />
        )}
        {!reducedMotion && incident.phase === "yellow" && incident.zone && (
          <path
            data-simulation-yellow-zone=""
            d={zonePath(track, incident.zone)}
            fill="none"
            className="stroke-yellow"
            strokeOpacity={0.6}
            strokeWidth={TRACK_SURFACE_ASPHALT_WIDTH}
            strokeLinecap="round"
          />
        )}
        <StartFinishLine geom={geom} patternId={`sim-checker-${idSuffix}`} lightMode={lightMode} />
        {showSectorMarkers && <SectorBoundaryMarkers geom={geom} rotationDeg={0} lightMode={lightMode} />}
        <DirectionArrows geom={geom} lightMode={lightMode} />
        {START_POSITIONS.map((pos, index) => (
          <g
            key={index}
            ref={(el) => { carRefs.current[index] = el; }}
            data-simulation-car=""
            className="text-muted"
            transform={carTransform(pointAt(track, pos))}
            style={{ color: carColors.length ? carColors[index % carColors.length] : undefined }}
          >
            <CarShape />
          </g>
        ))}
        {!reducedMotion && (
          <g ref={safetyCarRef} data-simulation-safety-car="" style={{ display: "none" }}>
            <SafetyCarShape />
          </g>
        )}
      </svg>
    </div>
  );
}
