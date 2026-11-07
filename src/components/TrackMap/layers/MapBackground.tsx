import { useId } from "react";
import {
  RING_BACKGROUND_OFFSETS,
  TRACK_BACKGROUND_GLOW_OPACITY,
  TRACK_BACKGROUND_GRID_SIZE,
  TRACK_BACKGROUND_LINE_OPACITY,
} from "@/constants";
import { TOKEN_HEX, TOKEN_HEX_LIGHT } from "@/designTokens";

interface Props {
  view: { x: number; y: number; w: number; h: number };
  lightMode: boolean;
  ring?: { cx: number; cy: number; radius: number };
}

export function MapBackground({ view, lightMode, ring }: Props) {
  const id = useId().replaceAll(":", "");
  const glowId = `map-glow-${id}`;
  const gridId = `map-grid-${id}`;
  const ink = lightMode ? TOKEN_HEX_LIGHT.fg : TOKEN_HEX.fg;

  return (
    <g aria-hidden="true" pointerEvents="none" data-testid="map-background">
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0%" stopColor={ink} stopOpacity={TRACK_BACKGROUND_GLOW_OPACITY} />
          <stop offset="100%" stopColor={ink} stopOpacity="0" />
        </radialGradient>
        {!ring && (
          <pattern id={gridId} width={TRACK_BACKGROUND_GRID_SIZE} height={TRACK_BACKGROUND_GRID_SIZE} patternUnits="userSpaceOnUse">
            <path
              d={`M ${TRACK_BACKGROUND_GRID_SIZE} 0 H 0 V ${TRACK_BACKGROUND_GRID_SIZE}`}
              fill="none"
              stroke={ink}
              strokeOpacity={TRACK_BACKGROUND_LINE_OPACITY}
              strokeWidth="0.5"
            />
          </pattern>
        )}
      </defs>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${glowId})`} />
      {ring ? (
        RING_BACKGROUND_OFFSETS.map((offset) => (
          <circle
            key={offset}
            cx={ring.cx}
            cy={ring.cy}
            r={ring.radius + offset}
            fill="none"
            stroke={ink}
            strokeOpacity={TRACK_BACKGROUND_LINE_OPACITY}
            strokeWidth="0.5"
          />
        ))
      ) : (
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${gridId})`} />
      )}
    </g>
  );
}
