import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import type { PitLanePath } from "@/data/pitLanes";
import { timingSectorForMarshalPost } from "@/timeline/raceControl";
import {
  RING_OFF_TRACK_M,
  RING_REF_LAP_MAX_MS,
  RING_REF_LAP_MIN_MS,
  RING_REF_TRACE_WINDOW_MS,
  RING_SEARCH_WINDOW,
} from "@/constants";
import type { LocationIndex } from "@/timeline/interpolate";
import { parseIntervalSeconds } from "@/utils/intervals";
import {
  buildArcPath,
  forwardSpan,
  layoutRingLabels,
  projectOntoPath,
  ringArcPath,
  ringPoint,
  wrapFraction,
  type ArcPath,
} from "@/utils/lapProgress";
import { projectToSvg, type TrackGeometry } from "../TrackMap/trackGeometry";
import {
  buildLapTimeProfile,
  latestFullLap,
  timeAtDistance,
  type LapTimeProfile,
  type LapTrace,
  type TraceSample,
} from "./lapTimeProfile";

/** Session-static geometry for the ring view, all in lap fractions (0–1). */
export interface RingModel {
  lap: ArcPath;
  /** Pit lane path with the lap fractions where it leaves and rejoins the track. */
  pit: { path: ArcPath; entry: number; exit: number } | null;
  /** Where sectors 2 and 3 start. */
  sectorBoundaries: [number, number];
  corners: { label: string; fraction: number }[];
  /** SVG units per metre; null when the outline isn't to scale (layout fallback). */
  unitsPerMetre: number | null;
}

export interface RingCarPlacement {
  /** Lap fraction (0–1) the car is drawn at. */
  fraction: number;
  /** In the pit lane / garage: drawn on the inner arc. */
  inPit: boolean;
  /** Lap segment matched; feed back as the next search hint. */
  segment: number;
}

/** A pit car must be at least this far off the centerline (m), so cars on the
 * main straight beside the pit wall stay on the ring. */
const PIT_MIN_OFFSET_M = 5;

export function buildRingModel({
  geom,
  circuitGeom,
  pitLane,
  totalMarshalPosts,
  toScale,
}: {
  geom: TrackGeometry;
  circuitGeom: CircuitGeometry | null;
  pitLane: PitLanePath | null;
  totalMarshalPosts: number;
  /** Outline is in real track coordinates (baked or GPS), not the coarse layout. */
  toScale: boolean;
}): RingModel {
  const lap = buildArcPath(geom.svgPts, true);
  const lapFractionOf = (x: number, y: number): number | null => {
    const { sx, sy } = projectToSvg(geom, x, y);
    return projectOntoPath(lap, sx, sy)?.fraction ?? null;
  };

  // F1 frame is decimetres: 10 units = 1 m.
  let unitsPerMetre: number | null = null;
  if (toScale) {
    const a = projectToSvg(geom, 0, 0);
    const b = projectToSvg(geom, 10, 0);
    unitsPerMetre = Math.hypot(b.sx - a.sx, b.sy - a.sy) || null;
  }

  let pit: RingModel["pit"] = null;
  if (pitLane && toScale && pitLane.x.length >= 2) {
    const pts = pitLane.x.map((x, i) => projectToSvg(geom, x, pitLane.y[i]!));
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const entry = projectOntoPath(lap, first.sx, first.sy)?.fraction;
    const exit = projectOntoPath(lap, last.sx, last.sy)?.fraction;
    if (entry != null && exit != null) {
      pit = { path: buildArcPath(pts, false), entry, exit };
    }
  }

  return {
    lap,
    pit,
    sectorBoundaries: sectorBoundaries(circuitGeom, totalMarshalPosts, lapFractionOf),
    corners: (circuitGeom?.corners ?? []).flatMap((c) => {
      const fraction = lapFractionOf(c.trackPosition.x, c.trackPosition.y);
      return fraction == null ? [] : [{ label: `${c.number}${c.letter}`, fraction }];
    }),
    unitsPerMetre,
  };
}

/**
 * Sector 2 and 3 start at the first marshal post assigned to them (as the 3D
 * map does); equal thirds without marshal posts (as the 2D map does).
 */
function sectorBoundaries(
  circuitGeom: CircuitGeometry | null,
  totalMarshalPosts: number,
  lapFractionOf: (x: number, y: number) => number | null,
): [number, number] {
  const posts = circuitGeom?.marshalSectors ?? [];
  const total = Math.max(totalMarshalPosts, posts.length);
  const startOf = (sector: 2 | 3, fallback: number): number => {
    const ofSector = posts.filter(
      (p) => timingSectorForMarshalPost(p.number, total) === sector,
    );
    if (!ofSector.length) return fallback;
    const first = ofSector.reduce((a, b) => (b.number < a.number ? b : a));
    return lapFractionOf(first.trackPosition.x, first.trackPosition.y) ?? fallback;
  };
  return [startOf(2, 1 / 3), startOf(3, 2 / 3)];
}

/** Where to draw a car (SVG position on the outline) on the ring. */
export function placeCar(
  model: RingModel,
  sx: number,
  sy: number,
  hint: number,
): RingCarPlacement | null {
  const upm = model.unitsPerMetre;
  const offTrack = upm != null ? RING_OFF_TRACK_M * upm : Infinity;
  const onLap = projectOntoPath(model.lap, sx, sy, hint, RING_SEARCH_WINDOW, offTrack);
  if (!onLap) return null;

  if (upm != null && onLap.dist > PIT_MIN_OFFSET_M * upm) {
    if (model.pit) {
      const inLane = projectOntoPath(model.pit.path, sx, sy);
      if (inLane && inLane.dist < onLap.dist) {
        const span = forwardSpan(model.pit.entry, model.pit.exit);
        return {
          fraction: wrapFraction(model.pit.entry + inLane.fraction * span),
          inPit: true,
          segment: onLap.segment,
        };
      }
    }
    if (onLap.dist > offTrack) {
      return { fraction: onLap.fraction, inPit: true, segment: onLap.segment };
    }
  }
  return { fraction: onLap.fraction, inPit: false, segment: onLap.segment };
}

export interface RingCar {
  num: number;
  fraction: number;
  inPit: boolean;
}

export interface RingCarLayout extends RingCar {
  /** Car dot centre. */
  x: number;
  y: number;
  /** Label anchor point and text alignment. */
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
  /** Leader line from the car to just short of its label. */
  leader: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Car dots and their labels: cars on track sit on the ring with labels spread
 * round the outside; pit cars sit on the inner arc with labels spread inside.
 */
export function layoutRingCars(
  cars: readonly RingCar[],
  geometry: { cx: number; cy: number; ringR: number; pitR: number; labelR: number; minGap: number },
): RingCarLayout[] {
  const { cx, cy, ringR, pitR, labelR, minGap } = geometry;
  const onTrack = cars.filter((c) => !c.inPit);
  const inPit = cars.filter((c) => c.inPit);
  const labelsOut = layoutRingLabels(
    onTrack.map((c) => ({ id: c.num, fraction: c.fraction })),
    minGap,
  );
  // Pit labels sit just inside the pit arc, clear of the dial's centre text.
  // The inner circle is shorter: same spacing in SVG units needs a wider gap.
  const pitLabelR = pitR - 22;
  const labelsIn = layoutRingLabels(
    inPit.map((c) => ({ id: c.num, fraction: c.fraction })),
    (minGap * labelR) / Math.max(1, pitLabelR),
  );

  const build = (car: RingCar, r: number, lr: number, labelFraction: number): RingCarLayout => {
    const dot = ringPoint(cx, cy, r, car.fraction);
    const label = ringPoint(cx, cy, lr, labelFraction);
    // Leader ends a little short of the label, along the line towards it.
    const dx = label.x - dot.x;
    const dy = label.y - dot.y;
    const len = Math.hypot(dx, dy) || 1;
    const stop = Math.max(0, len - 7);
    const start = Math.min(len, 6);
    // Horizontal alignment from which side of the ring the label is on.
    const side = Math.cos(labelFraction * 2 * Math.PI - Math.PI / 2);
    const outward = lr > r;
    const anchor: RingCarLayout["anchor"] =
      Math.abs(side) < 0.3 ? "middle" : side > 0 === outward ? "start" : "end";
    return {
      ...car,
      x: dot.x,
      y: dot.y,
      labelX: label.x,
      labelY: label.y,
      anchor,
      leader: {
        x1: dot.x + (dx / len) * start,
        y1: dot.y + (dy / len) * start,
        x2: dot.x + (dx / len) * stop,
        y2: dot.y + (dy / len) * stop,
      },
    };
  };

  return [
    ...onTrack.map((c) => build(c, ringR, labelR, labelsOut.get(c.num) ?? c.fraction)),
    ...inPit.map((c) => build(c, pitR, pitLabelR, labelsIn.get(c.num) ?? c.fraction)),
  ];
}

/** Session ms + lap fraction for every sample of `index` in [fromMs, toMs]. */
export function traceLap(
  model: RingModel,
  geom: TrackGeometry,
  index: LocationIndex,
  fromMs: number,
  toMs: number,
): TraceSample[] {
  const out: TraceSample[] = [];
  let hint = -1;
  const { times, xs, ys } = index;
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    if (t < fromMs) continue;
    if (t > toMs) break;
    const x = xs[i]!;
    const y = ys[i]!;
    if (x === 0 && y === 0) {
      out.push({ t, f: null });
      continue;
    }
    const { sx, sy } = projectToSvg(geom, x, y);
    const placed = placeCar(model, sx, sy, hint);
    if (!placed) continue;
    hint = placed.segment;
    out.push({ t, f: placed.inPit ? null : placed.fraction });
  }
  return out;
}

/** Reference lap profile from every car's latest full lap before `tNow`. */
export function buildReferenceProfile(
  model: RingModel,
  geom: TrackGeometry,
  indexes: ReadonlyMap<number, LocationIndex>,
  tNow: number,
): LapTimeProfile | null {
  const laps: LapTrace[] = [];
  for (const index of indexes.values()) {
    const samples = traceLap(model, geom, index, tNow - RING_REF_TRACE_WINDOW_MS, tNow);
    const lap = latestFullLap(samples, { minMs: RING_REF_LAP_MIN_MS, maxMs: RING_REF_LAP_MAX_MS });
    if (lap) laps.push(lap);
  }
  return buildLapTimeProfile(laps);
}

/**
 * How lap (distance) fractions are drawn: by time through the reference lap
 * when there is one, else by distance; optionally running anticlockwise.
 */
export interface RingScale {
  profile: LapTimeProfile | null;
  reverse: boolean;
}

/** Lap fraction in time (or distance without a profile), before any flip. */
export function lapTimeFraction(scale: RingScale, f: number): number {
  return scale.profile ? timeAtDistance(scale.profile, f) : f;
}

/** Where on the dial (0–1, clockwise from 12 o'clock) to draw a distance fraction. */
export function toDisplay(scale: RingScale, f: number): number {
  return fromTimeFraction(scale, lapTimeFraction(scale, f));
}

/** Dial position for a lap time fraction (applies the flip). */
export function fromTimeFraction(scale: RingScale, tf: number): number {
  return scale.reverse ? 1 - tf : tf;
}

/** Arc along the direction of travel from distance `from` to `to`. */
export function displayArc(
  scale: RingScale,
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
): string {
  const a = toDisplay(scale, from);
  const b = toDisplay(scale, to);
  return scale.reverse ? ringArcPath(cx, cy, r, b, a) : ringArcPath(cx, cy, r, a, b);
}

/** Arc along the direction of travel between two lap time fractions (any real number; wrapped). */
export function timeArc(
  scale: RingScale,
  cx: number,
  cy: number,
  r: number,
  fromTf: number,
  toTf: number,
): string {
  const a = fromTimeFraction(scale, wrapFraction(fromTf));
  const b = fromTimeFraction(scale, wrapFraction(toTf));
  return scale.reverse ? ringArcPath(cx, cy, r, b, a) : ringArcPath(cx, cy, r, a, b);
}

/**
 * Signed on-track gap from car A to car B (lap time fractions), the short way
 * round: positive when B is ahead of A.
 */
export function signedTimeDelta(tfA: number, tfB: number): number {
  const d = wrapFraction(tfB - tfA);
  return d > 0.5 ? d - 1 : d;
}

type GapToLeader = {
  gap_to_leader: number | string | null;
  interval?: number | string | null;
} | undefined;

function lapGapLabel(value: string): string {
  const laps = parseInt(value.replace(/[^\d]/g, ""), 10);
  return `+${Number.isFinite(laps) ? laps : 1}L`;
}

function appendTimingGap(label: string, primary: number | string | null, secondary: number | string | null): string {
  const timing = parseIntervalSeconds(
    typeof primary === "string" && /LAP/i.test(primary) ? secondary : primary,
  );
  if (timing === null || timing <= 0) return label;
  return `${label} · +${timing.toFixed(1)}s`;
}

function leaderGapOf(row: GapToLeader, isLeader: boolean | undefined): { s: number } | { laps: number } | null {
  if (isLeader) return { s: 0 };
  if (!row) return null;
  const v = row.gap_to_leader;
  if (v === null) return isLeader === undefined ? { s: 0 } : null;
  if (typeof v === "string" && /LAP/i.test(v)) {
    const laps = parseInt(v.replace(/[^\d]/g, ""), 10);
    return { laps: Number.isFinite(laps) && laps > 0 ? laps : 1 };
  }
  const s = parseIntervalSeconds(v);
  // A known non-leader reading 0 s is a stale row from a pit cycle.
  if (s === 0 && isLeader === false) return null;
  return s === null ? null : { s };
}

/**
 * Gap text relative to the focused car: "+3.3" behind it, "−5.2" ahead of it,
 * "+1L" for a car a lap down on it. Null for the focused car itself or without
 * usable timing.
 */
export function formatFocusGap(
  row: GapToLeader,
  focusRow: GapToLeader,
  opts: { rowIsLeader?: boolean; focusIsLeader?: boolean } = {},
): string | null {
  const rival = leaderGapOf(row, opts.rowIsLeader);
  const focus = leaderGapOf(focusRow, opts.focusIsLeader);
  if (!rival || !focus) return null;
  if ("laps" in rival && "laps" in focus) return null;
  if ("laps" in rival) {
    return appendTimingGap(`+${rival.laps}L`, row?.gap_to_leader ?? null, row?.interval ?? null);
  }
  if ("laps" in focus) return `−${focus.laps}L`;
  const diff = rival.s - focus.s;
  if (Math.abs(diff) < 0.05) return "0.0";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}`;
}

export type RingGapMode = "interval" | "leader";

/**
 * Gap text under a ring label: "+1.2" s, "+1L" for lapped cars, "LEAD" for
 * the leader, or null without usable timing. With `leaderNumber` only that
 * car is the leader; other cars reading 0 s (stale rows during a pit cycle)
 * show their interval, or nothing.
 */
export function formatRingGap(
  row: { interval: number | string | null; gap_to_leader: number | string | null } | undefined,
  mode: RingGapMode,
  isLeader?: boolean,
): string | null {
  if (isLeader) return "LEAD";
  if (!row) return null;
  const leaderGap = row.gap_to_leader;
  const readsAsLeader = leaderGap === null || leaderGap === 0 || leaderGap === "0";
  if (readsAsLeader && isLeader === undefined) return "LEAD";
  const value = mode === "leader" ? leaderGap : row.interval;
  if (value === null) return null;
  if (typeof value === "string" && /LAP/i.test(value)) {
    const secondary = mode === "leader" ? row.interval : row.gap_to_leader;
    return appendTimingGap(lapGapLabel(value), value, secondary);
  }
  const s = parseIntervalSeconds(value);
  return s === null || s <= 0 ? null : `+${s.toFixed(1)}`;
}

/** Lap time as m:ss.sss. */
export function formatLapTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}
