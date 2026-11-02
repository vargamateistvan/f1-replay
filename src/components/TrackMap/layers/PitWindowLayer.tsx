import { memo } from "react";
import { PIT_MARKER_COLOR, PIT_WINDOW_COLOR } from "@/constants";
import { PIT_CONDITION_LABEL } from "@/utils/pitRejoin";
import type { MapPitWindow } from "../usePitWindow";
import { projectToSvg, type TrackGeometry } from "../trackGeometry";

const BAND_WIDTH = 14;
const TICK_HALF = 8;

function polyline(geom: TrackGeometry, points: MapPitWindow["behind"]): string {
  return points
    .map((p, i) => {
      const { sx, sy } = projectToSvg(geom, p.x, p.y);
      return `${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join("");
}

/**
 * The focused car's pit window on the track, as on the ring view: the band
 * behind it is what it would lose by pitting now (cars in it would pass it),
 * the fainter band ahead how far a car ahead would fall. Drawn under the
 * focused car's telemetry lines, wider than them, so both stay readable.
 */
export const PitWindowBands = memo(function PitWindowBands({
  geom,
  window,
}: {
  geom: TrackGeometry;
  window: MapPitWindow;
}) {
  return (
    <g pointerEvents="none" data-testid="pit-window">
      {window.ahead.length > 1 && (
        <path
          d={polyline(geom, window.ahead)}
          fill="none"
          stroke={PIT_WINDOW_COLOR}
          strokeWidth={BAND_WIDTH}
          strokeOpacity={0.3}
          strokeLinejoin="round"
          data-testid="pit-window-ahead"
        />
      )}
      {window.behind.length > 1 && (
        <path
          d={polyline(geom, window.behind)}
          fill="none"
          stroke={PIT_WINDOW_COLOR}
          strokeWidth={BAND_WIDTH}
          strokeOpacity={0.7}
          strokeLinejoin="round"
          data-testid="pit-window-behind"
        />
      )}
    </g>
  );
});

/** Dashed ticks across the track for the pit loss under the other track conditions. */
export const PitWindowMarkers = memo(function PitWindowMarkers({
  geom,
  window,
  rotationDeg,
}: {
  geom: TrackGeometry;
  window: MapPitWindow;
  rotationDeg: number;
}) {
  return (
    <g pointerEvents="none">
      {window.markers.map((m) => {
        const c = projectToSvg(geom, m.x, m.y);
        const next = projectToSvg(geom, m.x + m.dx, m.y + m.dy);
        const len = Math.hypot(next.sx - c.sx, next.sy - c.sy) || 1;
        // Normal to the direction of travel, in SVG space.
        const nx = -(next.sy - c.sy) / len;
        const ny = (next.sx - c.sx) / len;
        const lx = c.sx + nx * (TICK_HALF + 6);
        const ly = c.sy + ny * (TICK_HALF + 6);
        return (
          <g key={m.condition} data-testid={`pit-window-marker-${m.condition}`}>
            <line
              x1={c.sx - nx * TICK_HALF}
              y1={c.sy - ny * TICK_HALF}
              x2={c.sx + nx * TICK_HALF}
              y2={c.sy + ny * TICK_HALF}
              stroke={PIT_MARKER_COLOR}
              strokeWidth={3}
              strokeDasharray="2 1.5"
            />
            <text
              x={lx}
              y={ly}
              transform={`rotate(${-rotationDeg.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={6}
              fontWeight="900"
              fill={PIT_MARKER_COLOR}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={0.6}
              paintOrder="stroke"
              fontFamily="Inter, sans-serif"
            >
              {PIT_CONDITION_LABEL[m.condition]}
            </text>
          </g>
        );
      })}
    </g>
  );
});
