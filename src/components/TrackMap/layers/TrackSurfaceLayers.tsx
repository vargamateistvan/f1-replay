import { memo } from "react";
import type { CircuitLayout } from "@/data/circuits";
import { FLAG_COLORS } from "@/constants";
import type { TimingSectorFlags } from "@/timeline/raceControl";
import { mapBackgroundColor } from "../trackMapFormat";
import { projectBoundsToSvgRect, type TrackGeometry } from "../trackGeometry";
import { sectorStrokeProps } from "./sectorStroke";

/** `<clipPath>`s for each layout sector; render inside `<defs>`. */
export const SectorClipPaths = memo(function SectorClipPaths({
  geom,
  circuitLayout,
}: {
  geom: TrackGeometry;
  circuitLayout: CircuitLayout | null;
}) {
  if (!circuitLayout?.sectors) return null;
  return (
    <>
      {circuitLayout.sectors.map((sector) => {
        const { x, y, w, h } = projectBoundsToSvgRect(geom, sector.bounds);
        return (
          <clipPath
            key={`track-sector-clip-${sector.number}`}
            id={`track-sector-clip-${sector.number}`}
            clipPathUnits="userSpaceOnUse"
          >
            <rect x={x} y={y} width={w} height={h} />
          </clipPath>
        );
      })}
    </>
  );
});

/** Wide under-ribbon tinted per timing sector by its current flag. */
export const TrackConditionRibbon = memo(function TrackConditionRibbon({
  pathData,
  timingSectorFlags,
  circuitLayout,
  lightMode,
}: {
  pathData: string;
  timingSectorFlags: TimingSectorFlags;
  circuitLayout: CircuitLayout | null;
  lightMode: boolean;
}) {
  return (
    <>
      <path
        d={pathData}
        fill="none"
        stroke={lightMode ? "#c9d1e3" : "#293043"}
        strokeWidth={20}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={lightMode ? 0.35 : 0.45}
      />
      {([1, 2, 3] as const).map((sectorNum) => {
        const flag = timingSectorFlags[sectorNum] ?? "CLEAR";
        const color = FLAG_COLORS[flag] ?? FLAG_COLORS.CLEAR;
        const active = flag !== "CLEAR" && flag !== "GREEN";
        return (
          <path
            key={`ribbon-sector-${sectorNum}`}
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth={20}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...sectorStrokeProps(sectorNum, circuitLayout)}
            opacity={active ? 0.5 : 0.24}
          />
        );
      })}
    </>
  );
});

/**
 * Track surface: layered asphalt body with highlighted edges to read clearly
 * at a glance while staying subtle enough not to overpower the cars.
 */
export const TrackSurface = memo(function TrackSurface({
  pathData,
  gradientId,
  lightMode,
}: {
  pathData: string;
  gradientId: string;
  lightMode: boolean;
}) {
  return (
    <>
      <path
        d={pathData}
        strokeWidth={20}
        fill="none"
        stroke={lightMode ? "rgba(89,101,126,0.22)" : "rgba(0,0,0,0.38)"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={pathData}
        strokeWidth={16}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={lightMode ? 0.98 : 0.96}
      />
      <path
        d={pathData}
        strokeWidth={11}
        fill="none"
        stroke={lightMode ? "#bec9dc" : "#313947"}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={lightMode ? 0.88 : 0.9}
      />
      <path
        d={pathData}
        fill="none"
        stroke={lightMode ? "#93a2bd" : "#5b6475"}
        strokeWidth={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <path
        d={pathData}
        fill="none"
        stroke={lightMode ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.18)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={pathData}
        fill="none"
        stroke={lightMode ? "rgba(255,255,255,0.7)" : "rgba(214,219,232,0.4)"}
        strokeWidth={0.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1.6 7.5"
        opacity={0.7}
      />
    </>
  );
});

/** Start/finish marker anchored to the first outline segment. */
export const StartFinishLine = memo(function StartFinishLine({
  geom,
  patternId,
  lightMode,
}: {
  geom: TrackGeometry;
  patternId: string;
  lightMode: boolean;
}) {
  if (geom.svgPts.length < 2) return null;
  const p0 = geom.svgPts[0]!;
  const p1 = geom.svgPts[1]!;
  const dx = p1.sx - p0.sx;
  const dy = p1.sy - p0.sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const half = 7;
  const x1 = p0.sx + nx * half;
  const y1 = p0.sy + ny * half;
  const x2 = p0.sx - nx * half;
  const y2 = p0.sy - ny * half;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lightMode ? "#111318" : "#f2f4fb"}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.95}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`url(#${patternId})`}
        strokeWidth={6}
        strokeLinecap="round"
        opacity={1}
      />
    </g>
  );
});

/** S1 / S2 boundary ticks at one-third and two-thirds of the lap. */
export const SectorBoundaryMarkers = memo(function SectorBoundaryMarkers({
  geom,
  rotationDeg,
  lightMode,
}: {
  geom: TrackGeometry;
  rotationDeg: number;
  lightMode: boolean;
}) {
  if (geom.svgPts.length < 6) return null;
  const { svgPts, normArc } = geom;

  const markerFor = (target: number, label: "S1" | "S2") => {
    const idx = Math.max(
      1,
      normArc.findIndex((value) => value >= target),
    );
    const point = svgPts[idx]!;
    const prev = svgPts[idx - 1]!;
    const dx = point.sx - prev.sx;
    const dy = point.sy - prev.sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = 6.5;
    const lx = point.sx + nx * 9.8;
    const ly = point.sy + ny * 9.8;

    return (
      <g key={`sector-boundary-${label}`}>
        <line
          x1={point.sx + nx * half}
          y1={point.sy + ny * half}
          x2={point.sx - nx * half}
          y2={point.sy - ny * half}
          stroke="#9aa4be"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.82}
        />
        <circle
          cx={point.sx}
          cy={point.sy}
          r={3.1}
          fill={mapBackgroundColor(lightMode)}
          stroke="#aeb8cf"
          strokeWidth={0.8}
          opacity={0.95}
        />
        <text
          x={lx}
          y={ly}
          transform={`rotate(${-rotationDeg.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={4.8}
          fill={lightMode ? "#2a3246" : "#d4dbee"}
          fontFamily="Inter, sans-serif"
          fontWeight="900"
          letterSpacing="0.04em"
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <>
      {markerFor(1 / 3, "S1")}
      {markerFor(2 / 3, "S2")}
    </>
  );
});

/** Ten chevrons spaced evenly along the lap, pointing in the race direction. */
export const DirectionArrows = memo(function DirectionArrows({
  geom,
  lightMode,
}: {
  geom: TrackGeometry;
  lightMode: boolean;
}) {
  if (geom.svgPts.length < 12) return null;
  const { svgPts } = geom;
  const count = 10;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const idx = Math.floor((i / count) * (svgPts.length - 1));
        const point = svgPts[idx]!;
        const next = svgPts[(idx + 1) % svgPts.length]!;
        const angle =
          (Math.atan2(next.sy - point.sy, next.sx - point.sx) * 180) / Math.PI;
        return (
          <g
            key={`arrow-${idx}`}
            transform={`translate(${point.sx.toFixed(1)} ${point.sy.toFixed(1)}) rotate(${angle.toFixed(1)})`}
            opacity={0.62}
          >
            <path
              d="M-3.4,-1.5 L2.8,0 L-3.4,1.5"
              fill="none"
              stroke={lightMode ? "#303647" : "#d8deee"}
              strokeWidth={0.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </>
  );
});
