import { memo } from "react";
import { speedToColor } from "../trackMapFormat";
import type {
  BrakingHotspot,
  SpeedSegment,
  TintedSegment,
} from "../trackGeometry";

/**
 * Speed heat overlay: segments coloured blue (slow) → green → red (fast) by
 * the focused driver's recorded speed at each track position on their last
 * completed lap.
 */
export const SpeedHeatLayer = memo(function SpeedHeatLayer({
  segments,
}: {
  segments: readonly SpeedSegment[];
}) {
  return (
    <>
      {segments.map((seg, i) => (
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
    </>
  );
});

/** Per-segment tinted lines (lap delta, elevation). */
export const TintedSegmentLayer = memo(function TintedSegmentLayer({
  segments,
  keyPrefix,
  strokeWidth,
  opacityScale = 1,
}: {
  segments: readonly TintedSegment[];
  keyPrefix: string;
  strokeWidth: number;
  opacityScale?: number;
}) {
  return (
    <>
      {segments.map((seg, i) => (
        <line
          key={`${keyPrefix}-${i}`}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={seg.opacity * opacityScale}
        />
      ))}
    </>
  );
});

export const BrakingHotspots = memo(function BrakingHotspots({
  hotspots,
}: {
  hotspots: readonly BrakingHotspot[];
}) {
  return (
    <>
      {hotspots.map((hotspot) => (
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
    </>
  );
});
