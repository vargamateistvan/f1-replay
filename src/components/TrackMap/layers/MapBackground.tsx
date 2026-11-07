import { useId } from "react";
import {
  RING_BACKGROUND_MAJOR_TICK_EVERY,
  RING_BACKGROUND_MAJOR_TICK_LENGTH,
  RING_BACKGROUND_MAJOR_TICK_OPACITY,
  RING_BACKGROUND_OFFSETS,
  RING_BACKGROUND_START_TICK_OPACITY,
  RING_BACKGROUND_TICK_COUNT,
  RING_BACKGROUND_TICK_INSET,
  RING_BACKGROUND_TICK_LENGTH,
  RING_BACKGROUND_TICK_OPACITY,
  RING_BACKGROUND_TICK_OPACITY_LIGHT,
  RING_BACKGROUND_MAJOR_TICK_OPACITY_LIGHT,
  TRACK_BACKGROUND_GLOW_OPACITY,
  TRACK_BACKGROUND_GLOW_OPACITY_LIGHT,
  TRACK_BACKGROUND_GRID_SIZE,
  TRACK_BACKGROUND_LINE_OPACITY,
  TRACK_BACKGROUND_LINE_OPACITY_LIGHT,
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
  const glowOpacity = lightMode ? TRACK_BACKGROUND_GLOW_OPACITY_LIGHT : TRACK_BACKGROUND_GLOW_OPACITY;
  const lineOpacity = lightMode ? TRACK_BACKGROUND_LINE_OPACITY_LIGHT : TRACK_BACKGROUND_LINE_OPACITY;
  const outerRingRadius = ring ? ring.radius + Math.max(...RING_BACKGROUND_OFFSETS) : 0;

  return (
    <g aria-hidden="true" pointerEvents="none" data-testid="map-background">
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0%" stopColor={ink} stopOpacity={glowOpacity} />
          <stop offset="100%" stopColor={ink} stopOpacity="0" />
        </radialGradient>
        {!ring && (
          <pattern id={gridId} width={TRACK_BACKGROUND_GRID_SIZE} height={TRACK_BACKGROUND_GRID_SIZE} patternUnits="userSpaceOnUse">
            <path
              d={`M ${TRACK_BACKGROUND_GRID_SIZE} 0 H 0 V ${TRACK_BACKGROUND_GRID_SIZE}`}
              fill="none"
              stroke={ink}
              strokeOpacity={lineOpacity}
              strokeWidth={lightMode ? "0.65" : "0.5"}
            />
          </pattern>
        )}
      </defs>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${glowId})`} />
      {ring ? (
        <>
          {RING_BACKGROUND_OFFSETS.map((offset) => (
            <circle
              key={offset}
              cx={ring.cx}
              cy={ring.cy}
              r={ring.radius + offset}
              fill="none"
              stroke={ink}
              strokeOpacity={lineOpacity}
              strokeWidth={lightMode ? "0.65" : "0.5"}
            />
          ))}
          <g data-layer="ring-background-ticks">
            {Array.from({ length: RING_BACKGROUND_TICK_COUNT }, (_, index) => {
              const isMajor = index % RING_BACKGROUND_MAJOR_TICK_EVERY === 0;
              const length = isMajor ? RING_BACKGROUND_MAJOR_TICK_LENGTH : RING_BACKGROUND_TICK_LENGTH;
              const angle = (index / RING_BACKGROUND_TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
              const startRadius = outerRingRadius + RING_BACKGROUND_TICK_INSET;
              const endRadius = startRadius + length;
              const x1 = ring.cx + Math.cos(angle) * startRadius;
              const y1 = ring.cy + Math.sin(angle) * startRadius;
              const x2 = ring.cx + Math.cos(angle) * endRadius;
              const y2 = ring.cy + Math.sin(angle) * endRadius;
              const isStart = index === 0;

              return (
                <path
                  key={index}
                  d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`}
                  fill="none"
                  stroke={isStart ? TOKEN_HEX.f1red : ink}
                  strokeOpacity={
                    isStart
                      ? RING_BACKGROUND_START_TICK_OPACITY
                      : isMajor
                        ? lightMode
                          ? RING_BACKGROUND_MAJOR_TICK_OPACITY_LIGHT
                          : RING_BACKGROUND_MAJOR_TICK_OPACITY
                        : lightMode
                          ? RING_BACKGROUND_TICK_OPACITY_LIGHT
                          : RING_BACKGROUND_TICK_OPACITY
                  }
                  strokeWidth={isMajor ? "1" : "0.75"}
                />
              );
            })}
          </g>
        </>
      ) : (
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${gridId})`} />
      )}
    </g>
  );
}
