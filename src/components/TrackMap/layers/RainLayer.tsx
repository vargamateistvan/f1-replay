import { memo, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Weather } from "@/api/types";
import {
  MAP_RAIN_HAZE_CENTER_OPACITY,
  MAP_RAIN_HAZE_OPACITY,
  MAP_RAIN_LAYERS,
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

function ActiveRain({
  view: cameraView,
  preview,
  weather,
}: Pick<Props, "view" | "preview" | "weather">) {
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
  const windAngle = ((weather?.wind_direction ?? 0) * Math.PI) / 180;
  const rawWindDrift =
    -Math.min(24, Math.max(0, weather?.wind_speed ?? 0) * 1.5) * Math.sin(windAngle);
  const windDrift = Math.abs(rawWindDrift) < 0.001 ? 0 : rawWindDrift;
  const style: CSSProperties = {
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
        <linearGradient id={`${id}-drop`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="65%" stopColor="currentColor" stopOpacity="0.7" />
          <stop offset="100%" stopColor="currentColor" />
        </linearGradient>
        <radialGradient id={`${id}-haze`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity={MAP_RAIN_HAZE_CENTER_OPACITY} />
          <stop offset="100%" stopColor="currentColor" />
        </radialGradient>
        {MAP_RAIN_LAYERS.map((layer) => (
          <pattern
            key={layer.name}
            id={`${id}-${layer.name}`}
            width={layer.width}
            height={layer.height}
            patternUnits="userSpaceOnUse"
          >
            {layer.streaks.map(([x1, y1, x2, y2]) => (
              <line
                key={x1}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`url(#${id}-drop)`}
                strokeWidth={layer.strokeWidth}
                strokeLinecap="round"
              />
            ))}
          </pattern>
        ))}
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
        <rect
          data-testid="map-rain-haze"
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill={`url(#${id}-haze)`}
          opacity={MAP_RAIN_HAZE_OPACITY}
        />
        {!reducedMotion && (
          <g data-testid="map-rain-streaks" style={style}>
            {MAP_RAIN_LAYERS.map((layer) => {
              const layerStyle: CSSProperties & {
                "--track-rain-step": string;
                "--track-rain-drift": string;
              } = {
                "--track-rain-step": `${-layer.height}px`,
                "--track-rain-drift": `${-windDrift * layer.drift}px`,
                animation: `track-rain-fall ${layer.cycleMs}ms linear infinite`,
                animationDelay: `${-layer.cycleMs * layer.drift}s`,
                animationPlayState: style.animationPlayState,
              };
              return (
                <g key={layer.name} data-rain-depth={layer.name} style={layerStyle} opacity={layer.opacity}>
                  <rect
                    x={view.x}
                    y={view.y}
                    width={view.w}
                    height={view.h + layer.height}
                    fill={`url(#${id}-${layer.name})`}
                  />
                </g>
              );
            })}
          </g>
        )}
      </g>
    </g>
  );
}

export const RainLayer = memo(function RainLayer({ enabled, weather, view, preview }: Props) {
  if (!enabled || !weather || !(weather.rainfall > 0)) return null;
  return <ActiveRain view={view} preview={preview} weather={weather} />;
});
