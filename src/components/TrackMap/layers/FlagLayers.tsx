import { memo } from "react";
import type { CircuitLayout } from "@/data/circuits";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { FLAG_COLORS } from "@/constants";
import {
  isActiveTrackFlag,
  resolveFlagForMarshalPost,
  type TimingSectorFlags,
  type TrackFlagState,
} from "@/timeline/raceControl";
import {
  projectBoundsToSvgRect,
  projectToSvg,
  type MarshalHeatmapSegment,
  type TrackGeometry,
} from "../trackGeometry";
import { sectorStrokeProps } from "./sectorStroke";

/** Glow + band + highlight stroke stack used for every flag paint. */
function FlagStroke({
  pathData,
  color,
  extra,
}: {
  pathData: string;
  color: string;
  extra?: ReturnType<typeof sectorStrokeProps>;
}) {
  return (
    <>
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...extra}
        opacity={0.25}
      />
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...extra}
        opacity={0.7}
      />
      <path
        d={pathData}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...extra}
        opacity={0.18}
      />
    </>
  );
}

/**
 * Flag colours on the track line. An active track-wide flag paints the whole
 * track; otherwise only the affected timing sector(s) are painted. An inactive
 * global flag such as CHEQUERED falls through, so sector flags raised during
 * the cool-down lap are still drawn.
 */
export const TrackFlagColors = memo(function TrackFlagColors({
  pathData,
  trackFlagState,
  timingSectorFlags,
  circuitLayout,
}: {
  pathData: string;
  trackFlagState: TrackFlagState;
  timingSectorFlags: TimingSectorFlags;
  circuitLayout: CircuitLayout | null;
}) {
  const globalFlag = trackFlagState.globalFlag;
  if (isActiveTrackFlag(globalFlag)) {
    const color = FLAG_COLORS[globalFlag] ?? null;
    if (!color) return null;
    return (
      <g key="track-global-color">
        <FlagStroke pathData={pathData} color={color} />
      </g>
    );
  }

  return (
    <>
      {([1, 2, 3] as const).map((sectorNum) => {
        const flag = timingSectorFlags[sectorNum];
        if (!flag) return null;
        const color = FLAG_COLORS[flag] ?? null;
        if (!color) return null;
        return (
          <g key={`track-sector-color-${sectorNum}`}>
            <FlagStroke
              pathData={pathData}
              color={color}
              extra={sectorStrokeProps(sectorNum, circuitLayout)}
            />
          </g>
        );
      })}
    </>
  );
});

/**
 * Flag tint overlaid when a flag is active.
 * With baked geometry: precise colored dots at each marshal sector position.
 * Fallback: rectangle tints over legacy sector boxes.
 */
export const SectorFlagTints = memo(function SectorFlagTints({
  geom,
  circuitGeom,
  circuitLayout,
  trackFlagState,
  timingSectorFlags,
}: {
  geom: TrackGeometry;
  circuitGeom: CircuitGeometry | null;
  circuitLayout: CircuitLayout | null;
  trackFlagState: TrackFlagState;
  timingSectorFlags: TimingSectorFlags;
}) {
  if (circuitGeom?.marshalSectors.length) {
    return (
      <>
        {circuitGeom.marshalSectors.map((ms) => {
          // Paint the post the feed actually flagged, not a third of the lap.
          const flagKey = resolveFlagForMarshalPost(trackFlagState, ms.number);
          const tint = flagKey ? (FLAG_COLORS[flagKey] ?? null) : null;
          if (!tint) return null;
          const { sx, sy } = projectToSvg(
            geom,
            ms.trackPosition.x,
            ms.trackPosition.y,
          );
          return (
            <circle
              key={`flag-ms-${ms.number}`}
              cx={sx}
              cy={sy}
              r={4}
              fill={tint}
              fillOpacity={0.7}
            />
          );
        })}
      </>
    );
  }

  if (!circuitLayout) return null;
  return (
    <>
      {circuitLayout.sectors.map((sector) => {
        const flagKey = timingSectorFlags[sector.number];
        const tint = flagKey ? (FLAG_COLORS[flagKey] ?? null) : null;
        if (!tint) return null;
        const { x, y, w, h } = projectBoundsToSvgRect(geom, sector.bounds);
        return (
          <rect
            key={`flag-tint-${sector.number}`}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={tint}
            opacity={0.28}
          />
        );
      })}
    </>
  );
});

/** Per-marshal-post flag segments, styled like the sector flag paint. */
export const MarshalFlagSegments = memo(function MarshalFlagSegments({
  pathData,
  segments,
  trackFlagState,
}: {
  pathData: string;
  segments: readonly MarshalHeatmapSegment[];
  trackFlagState: TrackFlagState | null;
}) {
  if (!segments.length) return null;
  return (
    <>
      {segments.map((seg) => {
        // Exactly the posts the feed flagged, plus any active track-wide
        // flag. Deliberately no timing-sector fallback: that would paint
        // every post in the same third and imply flags that were never
        // raised. Sector-level state is conveyed by the ribbon and badges.
        const flag = resolveFlagForMarshalPost(
          trackFlagState,
          seg.marshalNumber,
        );

        if (!isActiveTrackFlag(flag)) return null;
        const color = FLAG_COLORS[flag] ?? null;
        if (!color) return null;

        const dash = {
          pathLength: 1,
          strokeDasharray: `${seg.len.toFixed(4)} ${(1 - seg.len).toFixed(4)}`,
          strokeDashoffset: `-${seg.arcStart.toFixed(4)}`,
        };
        return (
          <g
            key={`marshal-flag-segment-${seg.marshalNumber}`}
            data-testid={`marshal-flag-segment-${seg.marshalNumber}`}
          >
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={10}
              strokeLinecap="round"
              {...dash}
              opacity={0.2}
            />
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={6}
              strokeLinecap="round"
              {...dash}
              opacity={0.55}
            />
            <path
              d={pathData}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinecap="round"
              {...dash}
              opacity={0.14}
            />
          </g>
        );
      })}
    </>
  );
});
