import { memo } from "react";
import type { CircuitLayout } from "@/data/circuits";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { locationToSvg } from "@/hooks/useTrackMap";
import { TRACK_SVG_PAD as PAD, SECTOR_COLORS } from "@/constants";
import { timingSectorForMarshalPost } from "@/timeline/raceControl";
import {
  nearestSvgPointIndex,
  projectBoundsToSvgRect,
  projectToSvg,
  type MarshalHeatmapSegment,
  type TrackGeometry,
} from "../trackGeometry";

/**
 * Marshal-sector heatmap: each individual marshal post as a distinct arc
 * segment on the track ribbon, coloured by timing sector with alternating
 * opacity so adjacent posts are visually separable.
 */
export const MarshalHeatmapLayer = memo(function MarshalHeatmapLayer({
  pathData,
  segments,
}: {
  pathData: string;
  segments: readonly MarshalHeatmapSegment[];
}) {
  return (
    <>
      {segments.map((seg) => (
        <path
          key={`mh-${seg.index}`}
          d={pathData}
          fill="none"
          stroke={SECTOR_COLORS[seg.sector]}
          strokeWidth={7}
          strokeLinecap="butt"
          pathLength={1}
          strokeDasharray={`${seg.len.toFixed(4)} ${(1 - seg.len).toFixed(4)}`}
          strokeDashoffset={`-${seg.arcStart.toFixed(4)}`}
          opacity={seg.i % 2 === 0 ? 0.72 : 0.38}
        />
      ))}
    </>
  );
});

/** DRS zones, plus legacy sector rectangles when there is no baked geometry. */
export const CircuitLayoutOverlays = memo(function CircuitLayoutOverlays({
  geom,
  circuitLayout,
  hasBaked,
}: {
  geom: TrackGeometry;
  circuitLayout: CircuitLayout | null;
  hasBaked: boolean;
}) {
  if (!circuitLayout) return null;

  const drsElements = circuitLayout.drsZones.map((zone, idx) => {
    const a = projectToSvg(geom, zone.line.x1, zone.line.y1);
    const b = projectToSvg(geom, zone.line.x2, zone.line.y2);
    return (
      <g key={`drs-${idx}`}>
        <line
          x1={a.sx}
          y1={a.sy}
          x2={b.sx}
          y2={b.sy}
          stroke="#4da6ff"
          strokeWidth={3}
          opacity={0.8}
        />
        <circle cx={a.sx} cy={a.sy} r={2.5} fill="#4da6ff" />
      </g>
    );
  });

  const sectorRects = hasBaked
    ? []
    : circuitLayout.sectors.map((sector) => {
        const { x, y, w, h } = projectBoundsToSvgRect(geom, sector.bounds);
        return (
          <g key={`sector-${sector.number}`} opacity={0.15}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={SECTOR_COLORS[sector.number]}
            />
            <text
              x={x + w / 2}
              y={y + h / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fill={SECTOR_COLORS[sector.number]}
              fontWeight="bold"
              fontFamily="Inter, sans-serif"
            >
              S{sector.number}
            </text>
          </g>
        );
      });

  if (!drsElements.length && !sectorRects.length) return null;
  return (
    <>
      {sectorRects}
      {drsElements}
    </>
  );
});

/** Marshal post dots from baked geometry, coloured by timing sector. */
export const MarshalSectorDots = memo(function MarshalSectorDots({
  geom,
  circuitGeom,
}: {
  geom: TrackGeometry;
  circuitGeom: CircuitGeometry | null;
}) {
  if (!circuitGeom?.marshalSectors.length) return null;
  const total = circuitGeom.marshalSectors.length;
  return (
    <>
      {circuitGeom.marshalSectors.map((ms) => {
        const { sx, sy } = projectToSvg(
          geom,
          ms.trackPosition.x,
          ms.trackPosition.y,
        );
        const color =
          SECTOR_COLORS[timingSectorForMarshalPost(ms.number, total)];
        return (
          <circle
            key={`ms-${ms.number}`}
            cx={sx}
            cy={sy}
            r={2.5}
            fill={color}
            fillOpacity={0.35}
            stroke={color}
            strokeWidth={0.6}
            strokeOpacity={0.6}
          />
        );
      })}
    </>
  );
});

/**
 * Corner number labels from baked geometry — offset outside the ribbon via
 * the perpendicular normal at the nearest track point; counter-rotated so
 * they stay horizontal regardless of track rotation.
 */
export const CornerNumbers = memo(function CornerNumbers({
  geom,
  circuitGeom,
  rotationDeg,
  lightMode,
}: {
  geom: TrackGeometry;
  circuitGeom: CircuitGeometry | null;
  rotationDeg: number;
  lightMode: boolean;
}) {
  if (!circuitGeom?.corners.length) return null;
  const { bounds, innerW, innerH, svgPts } = geom;
  const OFFSET = 16; // px outside the track ribbon

  return (
    <>
      <defs>
        <filter id="cornerShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="0.8"
            stdDeviation="1"
            floodOpacity={lightMode ? "0.2" : "0.5"}
          />
        </filter>
      </defs>
      {circuitGeom.corners.map((corner) => {
        // Corner apex in unpadded SVG space (PAD is added after the offset).
        const { sx: apexSx, sy: apexSy } = locationToSvg(
          corner.trackPosition.x,
          corner.trackPosition.y,
          bounds,
          innerW,
          innerH,
        );
        const bestIdx = nearestSvgPointIndex(svgPts, apexSx, apexSy);

        // Perpendicular normal at that point
        const prev = svgPts[Math.max(0, bestIdx - 1)]!;
        const next = svgPts[Math.min(svgPts.length - 1, bestIdx + 1)]!;
        const tdx = next.sx - prev.sx;
        const tdy = next.sy - prev.sy;
        const tlen = Math.hypot(tdx, tdy) || 1;
        // Left-hand normal (points to the outside for CW circuits)
        const nx = -tdy / tlen;
        const ny = tdx / tlen;

        const cx = apexSx + PAD + nx * OFFSET;
        const cy = apexSy + PAD + ny * OFFSET;

        return (
          <text
            key={`corner-${corner.number}${corner.letter}`}
            x={cx}
            y={cy}
            transform={`rotate(${-rotationDeg.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={5}
            fill={lightMode ? "#1e40af" : "#fbbf24"}
            stroke={lightMode ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.3)"}
            strokeWidth={0.4}
            fontFamily="Inter, sans-serif"
            fontWeight="700"
            letterSpacing="0.02em"
            filter="url(#cornerShadow)"
            style={{ paintOrder: "stroke" }}
          >
            {`${corner.number}${corner.letter}`}
          </text>
        );
      })}
    </>
  );
});
