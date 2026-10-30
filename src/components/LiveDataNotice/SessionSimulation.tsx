import { useMemo } from "react";
import type { Session } from "@/api/types";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useCachedSimulationDrivers } from "@/hooks/useSession";
import { circuitThumbnail } from "@/utils/circuitInfo";
import { teamColor } from "@/utils/color";
import {
  SESSION_SIMULATION_CARS,
  SESSION_SIMULATION_LAP_SECONDS,
  SESSION_SIMULATION_LAP_STEP_SECONDS,
  TRACK_SVG_H,
  TRACK_SVG_PAD,
  TRACK_SVG_W,
} from "@/constants";

export function SessionSimulation({
  session,
}: {
  session: Pick<Session, "session_key" | "date_start" | "circuit_key" | "year" | "circuit_short_name"> | undefined;
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
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const outline = useMemo(
    () => geometry
      ? circuitThumbnail(geometry, TRACK_SVG_W, TRACK_SVG_H, TRACK_SVG_PAD, 0)
      : null,
    [geometry],
  );
  if (!outline) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-4 top-4 font-mono text-caption uppercase tracking-caps text-muted">
        {session?.circuit_short_name} · Simulation · Not live data
      </div>
      <svg
        viewBox={`0 0 ${TRACK_SVG_W} ${TRACK_SVG_H}`}
        className="h-full w-full opacity-40"
        aria-hidden="true"
      >
        <path d={outline.path} fill="none" className="stroke-panel" strokeWidth={12} />
        <path d={outline.path} fill="none" className="stroke-line" strokeWidth={1} />
        <line {...outline.startLine} className="stroke-fg" strokeWidth={2} />
        {Array.from({ length: SESSION_SIMULATION_CARS }, (_, index) => {
          const progress = index / SESSION_SIMULATION_CARS;
          const paceRank = index % 2 === 0
            ? index / 2
            : SESSION_SIMULATION_CARS - 1 - Math.floor(index / 2);
          const duration = SESSION_SIMULATION_LAP_SECONDS +
            paceRank * SESSION_SIMULATION_LAP_STEP_SECONDS;
          return (
            <g
              key={index}
              data-simulation-car=""
              className="text-muted"
              style={{
                color: colors.length ? colors[index % colors.length] : undefined,
                ...(reducedMotion ? {
                  offsetPath: `path("${outline.path}")`,
                  offsetDistance: `${progress * 100}%`,
                  offsetRotate: "auto",
                } : {}),
              }}
            >
              {!reducedMotion && (
                <animateMotion
                  path={outline.path}
                  rotate="auto"
                  dur={`${duration}s`}
                  begin={`${-progress * duration}s`}
                  calcMode="paced"
                  repeatCount="indefinite"
                />
              )}
              <g transform="rotate(90)">
                <path
                  d="M-3-7H3V-5H1.5L2-2V3L3 5V7H-3V5L-2 3V-2L-1.5-5H-3Z"
                  fill="currentColor"
                />
                <path d="M-4-4H-2V-1H-4ZM2-4H4V-1H2ZM-4 3H-2V6H-4ZM2 3H4V6H2Z" className="fill-sunken stroke-muted" strokeWidth={0.4} />
                <path d="M-3 6H3M-3-6H3" className="stroke-fg" strokeWidth={0.6} />
                <ellipse cy={1} rx={0.9} ry={1.5} className="fill-sunken" />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
