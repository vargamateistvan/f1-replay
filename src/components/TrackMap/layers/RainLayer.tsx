import { memo, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Weather } from "@/api/types";
import {
  MAP_RAIN_CYCLE_MS,
  MAP_RAIN_STREAK_OPACITY,
  MAP_RAIN_STREAKS,
  MAP_RAIN_STROKE_W,
  MAP_RAIN_TILE_H,
  MAP_RAIN_TILE_W,
  MAP_RAIN_TINT_OPACITY,
} from "@/constants";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTimeline } from "@/timeline/clock";
import { visibleViewSize } from "../trackCamera";

interface Props {
  enabled: boolean;
  weather: Weather | null;
  view: { x: number; y: number; w: number; h: number };
  preview?: boolean;
}

function ActiveRain({ view: cameraView, preview }: Pick<Props, "view" | "preview">) {
  const id = useId().replaceAll(":", "");
  const layerRef = useRef<SVGGElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    const svg = layerRef.current?.ownerSVGElement;
    if (!svg) return;
    const measure = ({ width, height }: Pick<DOMRectReadOnly, "width" | "height">) => {
      if (width > 0 && height > 0) setAspect(width / height);
    };
    measure(svg.getBoundingClientRect());
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  // xMidYMid meet exposes SVG space outside the viewBox in letterboxed panes.
  const size = visibleViewSize(cameraView.w, cameraView.h, aspect ?? cameraView.w / cameraView.h);
  const view = {
    x: cameraView.x - (size.w - cameraView.w) / 2,
    y: cameraView.y - (size.h - cameraView.h) / 2,
    ...size,
  };
  const playing = useTimeline((state) => state.playing);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const style: CSSProperties & { "--track-rain-step": string } = {
    "--track-rain-step": `${-MAP_RAIN_TILE_H}px`,
    animation: `track-rain-fall ${MAP_RAIN_CYCLE_MS}ms linear infinite`,
    animationPlayState: playing && !preview ? "running" : "paused",
  };
  return (
    <g
      ref={layerRef}
      data-testid="map-rain-effects"
      aria-hidden="true"
      pointerEvents="none"
      className="text-blue-fg"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} />
        </clipPath>
        <pattern
          id={`${id}-streaks`}
          width={MAP_RAIN_TILE_W}
          height={MAP_RAIN_TILE_H}
          patternUnits="userSpaceOnUse"
        >
          {MAP_RAIN_STREAKS.map(([x1, y1, x2, y2]) => (
            <line
              key={x1}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={MAP_RAIN_STROKE_W}
              strokeLinecap="round"
            />
          ))}
        </pattern>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="currentColor"
          opacity={MAP_RAIN_TINT_OPACITY}
        />
        {!reducedMotion && (
          <g data-testid="map-rain-streaks" style={style} opacity={MAP_RAIN_STREAK_OPACITY}>
            <rect
              x={view.x}
              y={view.y}
              width={view.w}
              height={view.h + MAP_RAIN_TILE_H}
              fill={`url(#${id}-streaks)`}
            />
          </g>
        )}
      </g>
    </g>
  );
}

export const RainLayer = memo(function RainLayer({ enabled, weather, view, preview }: Props) {
  if (!enabled || !weather || !(weather.rainfall > 0)) return null;
  return <ActiveRain view={view} preview={preview} />;
});
