import { memo } from "react";
import type { CircuitLayout } from "@/data/circuits";
import {
  FLAG_COLORS,
  TRACK_SURFACE_CORNER_ANGLE_DEG,
  TRACK_SURFACE_CORNER_WINDOW_PX,
  TRACK_SURFACE_ASPHALT_WIDTH,
  TRACK_SURFACE_KERB_EDGE_OFFSET,
  TRACK_SURFACE_KERB_PATCH_LENGTH,
  TRACK_SURFACE_KERB_JOIN_GAP,
  TRACK_SURFACE_HIGHLIGHT_OPACITY,
  TRACK_SURFACE_KERB_DASH_LENGTH,
  TRACK_SURFACE_KERB_OPACITY,
  TRACK_SURFACE_KERB_WIDTH,
  TRACK_SECTOR_MARKER_LABEL_OFFSET,
  TRACK_SECTOR_MARKER_TICK_OUTLINE_WIDTH,
  TRACK_SECTOR_MARKER_TICK_HALF,
  TRACK_SECTOR_MARKER_TICK_WIDTH,
} from "@/constants";
import { TOKEN_HEX, TOKEN_HEX_LIGHT } from "@/designTokens";
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

/** Paint active flag colours beneath the asphalt without a green clear-state band. */
export const TrackConditionRibbon = memo(function TrackConditionRibbon({
  pathData,
  timingSectorFlags,
  circuitLayout,
}: {
  pathData: string;
  timingSectorFlags: TimingSectorFlags;
  circuitLayout: CircuitLayout | null;
}) {
  return (
    <>
      {([1, 2, 3] as const).map((sectorNum) => {
        const flag = timingSectorFlags[sectorNum] ?? "CLEAR";
        const color = FLAG_COLORS[flag] ?? FLAG_COLORS.CLEAR;
        const active = flag !== "CLEAR" && flag !== "GREEN";
        if (!active) return null;
        return (
          <path
            key={`ribbon-sector-${sectorNum}`}
            data-track-layer={`flag-ribbon-${sectorNum}`}
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth={20}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...sectorStrokeProps(sectorNum, circuitLayout)}
            opacity={0.5}
          />
        );
      })}
    </>
  );
});

/**
 * Track surface: asphalt bordered by a visible red-and-white kerb strip.
 */
/** Asphalt fill shared by the 2D map and the session simulation. */
export function TrackSurfaceGradient({ id, lightMode }: { id: string; lightMode: boolean }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor={lightMode ? "#eaf1ff" : "#303949"} />
      <stop offset="52%" stopColor={lightMode ? "#cdd8ed" : "#202835"} />
      <stop offset="100%" stopColor={lightMode ? "#aebad0" : "#141922"} />
    </linearGradient>
  );
}

export const TrackSurface = memo(function TrackSurface({
  geom,
  gradientId,
  lightMode,
  showKerbs,
}: {
  geom: TrackGeometry;
  gradientId: string;
  lightMode: boolean;
  showKerbs: boolean;
}) {
  const { pathData, svgPts } = geom;
  const kerbDash = `${TRACK_SURFACE_KERB_DASH_LENGTH} ${TRACK_SURFACE_KERB_DASH_LENGTH}`;
  const kerbPatches = showKerbs ? cornerKerbPaths(svgPts) : [];
  return (
    <>
      {kerbPatches.map(({ pathData: kerbPath, position, side }, index) => (
        <g key={`corner-kerb-${index}`}>
          <path
            d={kerbPath}
            data-track-layer="kerbs-red"
            data-track-kerb-position={position}
            data-track-kerb-side={side}
            strokeWidth={TRACK_SURFACE_KERB_WIDTH}
            fill="none"
            stroke={TOKEN_HEX.red}
            strokeLinecap="butt"
            strokeLinejoin="round"
            strokeDasharray={kerbDash}
            opacity={TRACK_SURFACE_KERB_OPACITY}
          />
          <path
            d={kerbPath}
            data-track-layer="kerbs-white"
            data-track-kerb-position={position}
            data-track-kerb-side={side}
            strokeWidth={TRACK_SURFACE_KERB_WIDTH}
            fill="none"
            stroke={TOKEN_HEX.white}
            strokeLinecap="butt"
            strokeLinejoin="round"
            strokeDasharray={kerbDash}
            strokeDashoffset={TRACK_SURFACE_KERB_DASH_LENGTH}
            opacity={TRACK_SURFACE_KERB_OPACITY}
          />
        </g>
      ))}
      <path
        d={pathData}
        data-track-layer="asphalt"
        strokeWidth={TRACK_SURFACE_ASPHALT_WIDTH}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={lightMode ? 0.98 : 0.96}
      />
      <path
        d={pathData}
        data-track-layer="asphalt-highlight"
        fill="none"
        stroke={lightMode ? TOKEN_HEX_LIGHT.fg : TOKEN_HEX.fg}
        strokeWidth={TRACK_SURFACE_ASPHALT_WIDTH / 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={TRACK_SURFACE_HIGHLIGHT_OPACITY}
      />
    </>
  );
});

interface KerbPatch {
  pathData: string;
  position: "entry" | "apex" | "exit" | "joined";
  side: "inside" | "outside";
}

interface KerbRange extends Omit<KerbPatch, "pathData"> {
  start: number;
  end: number;
  edge: -1 | 1;
}

function cornerKerbPaths(
  points: readonly { sx: number; sy: number }[],
): KerbPatch[] {
  const count = points.length;
  if (count < 6) return [];

  const get = (index: number) => points[(index + count) % count]!;
  const pointAtDistance = (index: number, direction: -1 | 1) => {
    let remaining = TRACK_SURFACE_CORNER_WINDOW_PX;
    let current = get(index);
    for (let step = 0; step < count; step++) {
      const next = get(index + direction * (step + 1));
      const dx = next.sx - current.sx;
      const dy = next.sy - current.sy;
      const length = Math.hypot(dx, dy);
      if (length >= remaining) {
        const ratio = remaining / length;
        return {
          sx: current.sx + dx * ratio,
          sy: current.sy + dy * ratio,
        };
      }
      remaining -= length;
      current = next;
    }
    return current;
  };

  const turnAngles = points.map((vertex, index) => {
    const before = pointAtDistance(index, -1);
    const after = pointAtDistance(index, 1);
    const inX = vertex.sx - before.sx;
    const inY = vertex.sy - before.sy;
    const outX = after.sx - vertex.sx;
    const outY = after.sy - vertex.sy;
    return Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY);
  });
  const minimumAngle = (TRACK_SURFACE_CORNER_ANGLE_DEG * Math.PI) / 180;
  const peakRadius = TRACK_SURFACE_CORNER_WINDOW_PX * 2;
  const corners: { index: number; direction: -1 | 1 }[] = [];

  for (let index = 0; index < count; index++) {
    const angle = turnAngles[index]!;
    if (Math.abs(angle) < minimumAngle) continue;
    const direction = Math.sign(angle) as -1 | 1;
    let isPeak = true;

    for (const walk of [-1, 1] as const) {
      let cursor = index;
      let distance = 0;
      for (let step = 0; step < count && distance < peakRadius; step++) {
        const nextIndex = (cursor + walk + count) % count;
        const current = get(cursor);
        const next = get(nextIndex);
        distance += Math.hypot(next.sx - current.sx, next.sy - current.sy);
        cursor = nextIndex;
        const nearbyAngle = turnAngles[cursor]!;
        if (
          Math.sign(nearbyAngle) === direction &&
          (Math.abs(nearbyAngle) > Math.abs(angle) ||
            (Math.abs(nearbyAngle) === Math.abs(angle) && cursor < index))
        ) {
          isPeak = false;
          break;
        }
      }
      if (!isPeak) break;
    }

    if (isPeak) {
      corners.push({ index, direction });
    }
  }
  if (!corners.length) return [];

  const patchHalfLength = TRACK_SURFACE_KERB_PATCH_LENGTH / 2;
  const patchCenters = [
    { position: "entry" as const, distance: -TRACK_SURFACE_CORNER_WINDOW_PX * 0.65 },
    { position: "apex" as const, distance: 0 },
    { position: "exit" as const, distance: TRACK_SURFACE_CORNER_WINDOW_PX * 0.65 },
  ];

  const distances = [0];
  for (let index = 0; index < count; index++) {
    const current = get(index);
    const next = get(index + 1);
    distances.push(distances[index]! + Math.hypot(next.sx - current.sx, next.sy - current.sy));
  }
  const perimeter = distances[count]!;
  if (perimeter === 0) return [];

  const patches = corners.flatMap(({ index, direction }) =>
    patchCenters.map(({ position, distance }): KerbRange => {
      const side: -1 | 1 =
        position === "apex" ? direction : direction === 1 ? -1 : 1;
      const start = ((distances[index]! + distance - patchHalfLength) % perimeter + perimeter) % perimeter;
      return {
        start,
        end: start + TRACK_SURFACE_KERB_PATCH_LENGTH,
        edge: side,
        position,
        side: side === direction ? "inside" : "outside",
      };
    }),
  );

  return ([-1, 1] as const).flatMap((edge) => {
    const sorted = patches.filter((patch) => patch.edge === edge).sort((a, b) => a.start - b.start);
    const merged: typeof sorted = [];
    for (const patch of sorted) {
      const previous = merged.at(-1);
      if (previous && patch.start - previous.end <= TRACK_SURFACE_KERB_JOIN_GAP) {
        previous.end = Math.max(previous.end, patch.end);
        previous.position = "joined";
      } else {
        merged.push({ ...patch });
      }
    }

    // The outline is a closed lap; join across its arbitrary start point too.
    const first = merged[0];
    const last = merged.at(-1);
    if (
      merged.length > 1 && first && last &&
      first.start + perimeter - last.end <= TRACK_SURFACE_KERB_JOIN_GAP
    ) {
      last.end = Math.max(last.end, first.end + perimeter);
      last.position = "joined";
      merged.shift();
    }
    return merged.map(({ start, end, position, side }) => ({
      position,
      side,
      pathData: offsetKerbPatch(points, start, end, edge, perimeter),
    }));
  });
}

function offsetKerbPatch(
  points: readonly { sx: number; sy: number }[],
  startDistance: number,
  endDistance: number,
  side: -1 | 1,
  perimeter: number,
): string {
  const count = points.length;
  const sampleCount = Math.max(5, Math.ceil((endDistance - startDistance) / TRACK_SURFACE_KERB_PATCH_LENGTH) * 4 + 1);
  const pathPoints = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const distance = (
      startDistance + ((endDistance - startDistance) * sampleIndex) / (sampleCount - 1)
    ) % perimeter;
    let remaining = distance;
    let cursor = 0;
    let current = points[cursor]!;
    let tangentX = 0;
    let tangentY = 0;

    for (let step = 0; step < count; step++) {
      const next = points[(cursor + 1) % count]!;
      const dx = next.sx - current.sx;
      const dy = next.sy - current.sy;
      const length = Math.hypot(dx, dy);
      if (length >= remaining) {
        const ratio = length === 0 ? 0 : remaining / length;
        const x = current.sx + dx * ratio;
        const y = current.sy + dy * ratio;
        tangentX = dx / (length || 1);
        tangentY = dy / (length || 1);
        const normalX = -tangentY * side;
        const normalY = tangentX * side;
        return {
          sx: x + normalX * TRACK_SURFACE_KERB_EDGE_OFFSET,
          sy: y + normalY * TRACK_SURFACE_KERB_EDGE_OFFSET,
        };
      }
      remaining -= length;
      current = next;
      cursor = (cursor + 1) % count;
    }
    return current;
  });

  return pathPoints
    .map(({ sx, sy }, index) => `${index === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`)
    .join(" ");
}

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

/** S1 / S2 timing gates at one-third and two-thirds of the lap. */
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
    const labelX = point.sx + nx * TRACK_SECTOR_MARKER_LABEL_OFFSET;
    const labelY = point.sy + ny * TRACK_SECTOR_MARKER_LABEL_OFFSET;
    const x1 = point.sx - nx * TRACK_SECTOR_MARKER_TICK_HALF;
    const y1 = point.sy - ny * TRACK_SECTOR_MARKER_TICK_HALF;
    const x2 = point.sx + nx * TRACK_SECTOR_MARKER_TICK_HALF;
    const y2 = point.sy + ny * TRACK_SECTOR_MARKER_TICK_HALF;
    return (
      <g
        key={`sector-boundary-${label}`}
        data-sector-marker={label}
        pointerEvents="none"
      >
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={mapBackgroundColor(lightMode)}
          strokeWidth={TRACK_SECTOR_MARKER_TICK_OUTLINE_WIDTH}
          strokeLinecap="round"
        />
        <line
          data-sector-gate-line=""
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={lightMode ? TOKEN_HEX_LIGHT.fg : TOKEN_HEX.fg}
          strokeWidth={TRACK_SECTOR_MARKER_TICK_WIDTH}
          strokeLinecap="round"
        />
        <text
          x={labelX}
          y={labelY}
          transform={`rotate(${-rotationDeg.toFixed(1)} ${labelX.toFixed(1)} ${labelY.toFixed(1)})`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={5.5}
          fill={lightMode ? TOKEN_HEX_LIGHT.fg : TOKEN_HEX.fg}
          stroke={mapBackgroundColor(lightMode)}
          strokeWidth={1.5}
          strokeLinejoin="round"
          paintOrder="stroke"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="800"
          letterSpacing="0.02em"
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
