import { memo } from "react";
import type { Driver } from "@/api/types";
import { isOffTrackPlaceholder } from "@/hooks/useTrackMap";
import { interpolateXY, type LocationIndex } from "@/timeline/interpolate";
import { teamColor } from "@/utils/color";
import type { MiniMapProjection } from "./miniMapProjection";

interface Props {
  readonly projection: MiniMapProjection;
  readonly indexes: ReadonlyMap<number, LocationIndex>;
  readonly driverByNumber: ReadonlyMap<number, Driver>;
  /** Session-relative playhead (coarse is fine at this size). */
  readonly t: number;
  /** Cars in shot: drawn larger, on top. */
  readonly highlight: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly background: string;
  readonly lightMode: boolean;
}

/** Whole-field overview while a close-up camera is on. */
export const MiniMap = memo(function MiniMap({
  projection,
  indexes,
  driverByNumber,
  t,
  highlight,
  retiredDrivers,
  background,
  lightMode,
}: Props) {
  const dots: Array<{ num: number; sx: number; sy: number; color: string; on: boolean }> = [];
  for (const [num, idx] of indexes) {
    if (retiredDrivers?.has(num)) continue;
    const pos = interpolateXY(idx, t);
    if (!pos || isOffTrackPlaceholder(pos)) continue;
    const { sx, sy } = projection.project(pos.x, pos.y);
    dots.push({
      num,
      sx,
      sy,
      color: teamColor(driverByNumber.get(num)?.team_colour, "#888888"),
      on: highlight.has(num),
    });
  }
  // Cars in shot last, so they draw on top.
  dots.sort((a, b) => Number(a.on) - Number(b.on));
  const ring = lightMode ? "#0b0f19" : "#ffffff";

  return (
    <svg
      width={projection.width}
      height={projection.height}
      viewBox={`0 0 ${projection.width.toFixed(1)} ${projection.height.toFixed(1)}`}
      className="block border border-panel"
      style={{ background, backdropFilter: "blur(4px)" }}
      role="img"
      aria-label="Track overview"
    >
      <path
        d={projection.pathData}
        fill="none"
        stroke={lightMode ? "rgba(15,23,42,0.45)" : "rgba(255,255,255,0.45)"}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {dots.map((d) => (
        <circle
          key={d.num}
          cx={d.sx}
          cy={d.sy}
          r={d.on ? 4.5 : 2.6}
          fill={d.color}
          stroke={d.on ? ring : "none"}
          strokeWidth={d.on ? 1.5 : 0}
        />
      ))}
    </svg>
  );
});
