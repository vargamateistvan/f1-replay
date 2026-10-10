import { memo } from "react";

/**
 * Dashed "ghost" car where the focused driver would rejoin if they pitted
 * now: the spot they occupied `pit loss` seconds ago, which is where the cars
 * they would come out among are right now.
 */
export const PitRejoinGhost = memo(function PitRejoinGhost({
  x,
  y,
  color,
  position,
  rotationDeg,
}: {
  x: number;
  y: number;
  color: string;
  position: number;
  rotationDeg: number;
}) {
  const labelX = 9;
  const labelY = 10;
  return (
    <g
      transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
      pointerEvents="none"
      data-testid="pit-rejoin-ghost"
    >
      <circle r={9} fill={color} opacity={0.12} />
      <circle
        r={6}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeDasharray="2.4 1.8"
        opacity={0.95}
      />
      <circle r={1.6} fill={color} opacity={0.95} />
      <text
        x={labelX}
        y={labelY}
        transform={`rotate(${-rotationDeg.toFixed(1)} ${labelX} ${labelY})`}
        fontSize={7}
        fill={color}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={0.6}
        paintOrder="stroke"
        fontFamily="Inter, sans-serif"
        fontWeight="900"
        letterSpacing="0.04em"
      >
        {`PIT P${position}`}
      </text>
    </g>
  );
});
