/**
 * Pit window for the 2D and 3D maps, the same picture as the ring view's:
 * the stretch of track the focused car would lose if it pitted now (band
 * behind it, ending at the rejoin ghost), how far a car ahead would fall
 * (fainter band ahead), ticks for the pit loss under the other track
 * conditions, and the cars inside the window. While the car is already in the
 * pits, the ghost shows where it rejoins, moving with the field.
 *
 * The ghost, the band behind and the condition ticks follow the car's own
 * trail (where it was `loss` seconds ago); the band ahead and the in-pit
 * rejoin use the ring's reference lap, which needs one full lap of data.
 * Everything is returned in the F1 frame; the maps project it themselves.
 */
import { useMemo, useRef } from "react";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { getPitLane } from "@/data/pitLanes";
import { RING_PIT_ENTRY_LOOKBACK_MS, RING_REF_REFRESH_MS } from "@/constants";
import { isOffTrackPlaceholder } from "@/hooks/useTrackMap";
import { interpolateXY, type LocationIndex } from "@/timeline/interpolate";
import {
  forwardSpan,
  locateOnPath,
  pathSlice,
  wrapFraction,
  type PathLocation,
} from "@/utils/lapProgress";
import {
  alternativePitLosses,
  parsePitLoss,
  pitRejoinView,
  pitWindowRivals,
  type PitLossCondition,
  type PitRejoinProjection,
} from "@/utils/pitRejoin";
import { distanceAtTime, timeAtDistance } from "../TrackRing/lapTimeProfile";
import {
  cachedPitEntry,
  cleanRejoinGaps,
  createPitEntryCache,
  inPitRejoin,
  type PitEntryCache,
} from "../TrackRing/pitWindow";
import {
  buildRingModel,
  createRingReferenceState,
  placeCar,
  traceReferenceLaps,
  updateReferenceProfile,
  type RingModel,
  type RingReferenceState,
} from "../TrackRing/ringModel";
import { projectToSvg, type TrackGeometry } from "./trackGeometry";

export interface MapPoint {
  x: number;
  y: number;
}

export interface PitWindowMarker extends MapPoint {
  condition: PitLossCondition;
  /** Unit direction of travel there (F1 frame). */
  dx: number;
  dy: number;
}

export interface MapPitWindow {
  projection: PitRejoinProjection;
  lossS: number;
  condition: PitLossCondition;
  /** The car is already in the pit lane: `ghost` is where it rejoins. */
  inPit: boolean;
  /** Rejoin point, or null without location coverage. */
  ghost: MapPoint | null;
  /** Centreline from the rejoin point forward to the car (empty in the pits). */
  behind: MapPoint[];
  /** Centreline from the car forward by the pit loss (needs a reference lap). */
  ahead: MapPoint[];
  markers: PitWindowMarker[];
  /** Cars inside the window, or either side of the in-pit rejoin point. */
  highlight: ReadonlySet<number>;
}

export interface PitWindowTrack {
  geom: TrackGeometry;
  /** Outline points in the F1 frame, index-aligned with `geom.svgPts`. */
  points: ReadonlyArray<MapPoint>;
  /** Real track coordinates (baked or GPS), not the coarse layout. */
  toScale: boolean;
}

/** A band longer than this share of the lap is GPS noise, not a pit window. */
const MAX_BAND_SPAN = 0.75;
const NO_HIGHLIGHT: ReadonlySet<number> = new Set();

interface WindowState {
  model: RingModel;
  hints: Map<number, number>;
  reference: RingReferenceState;
  pitEntry: PitEntryCache;
}

export function usePitWindow({
  track,
  circuitGeom,
  circuitKey,
  indexes,
  focusDriver,
  t,
  gaps,
  leaderNumber = null,
  trackVehicles,
  excluded,
}: {
  track: PitWindowTrack | null;
  circuitGeom: CircuitGeometry | null | undefined;
  circuitKey: number | null;
  indexes: ReadonlyMap<number, LocationIndex>;
  focusDriver: number | null;
  /** Session-relative playhead (ms). */
  t: number;
  /** Latest gap to leader per driver; null disables the window. */
  gaps: ReadonlyMap<number, number> | null | undefined;
  leaderNumber?: number | null;
  trackVehicles: { safetyCar?: boolean; vsc?: boolean } | null | undefined;
  excluded?: ReadonlySet<number>;
}): MapPitWindow | null {
  const pitLoss = useMemo(() => parsePitLoss(circuitGeom?.pitLoss), [circuitGeom]);
  const rejoinGaps = useMemo(() => cleanRejoinGaps(gaps, leaderNumber), [gaps, leaderNumber]);
  const enabled = track !== null && pitLoss !== null && rejoinGaps !== null;

  const model = useMemo(
    () =>
      enabled
        ? buildRingModel({
            geom: track.geom,
            circuitGeom: circuitGeom ?? null,
            pitLane: getPitLane(circuitKey),
            totalMarshalPosts: 0,
            toScale: track.toScale,
          })
        : null,
    [enabled, track, circuitGeom, circuitKey],
  );

  // Placement hints, pooled reference laps and the pit-entry scan belong to
  // one model; start afresh when it changes.
  const stateRef = useRef<WindowState | null>(null);
  if (model && stateRef.current?.model !== model) {
    stateRef.current = {
      model,
      hints: new Map(),
      reference: createRingReferenceState(),
      pitEntry: createPitEntryCache(),
    };
  }

  const refBucket = Math.floor(t / RING_REF_REFRESH_MS);
  const profile = useMemo(() => {
    const state = stateRef.current;
    if (!model || !track || !state || state.model !== model) return null;
    const tNow = refBucket * RING_REF_REFRESH_MS;
    const laps = traceReferenceLaps(model, track.geom, indexes, tNow);
    return updateReferenceProfile(state.reference, laps, tNow);
  }, [model, track, indexes, refBucket]);

  const result = useMemo(() => {
    const state = stateRef.current;
    if (!model || !track || !state || !pitLoss || !rejoinGaps || focusDriver === null) return null;
    const index = indexes.get(focusDriver);
    if (!index) return null;

    const place = (num: number | null, pos: MapPoint) => {
      const { sx, sy } = projectToSvg(track.geom, pos.x, pos.y);
      const placed = placeCar(model, sx, sy, num === null ? -1 : (state.hints.get(num) ?? -1));
      if (placed && num !== null) state.hints.set(num, placed.segment);
      return placed;
    };
    const toPoint = ({ i, j, u }: PathLocation): MapPoint => {
      const a = track.points[i]!;
      const b = track.points[j]!;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    };
    const band = (from: number, to: number): MapPoint[] =>
      forwardSpan(from, to) > MAX_BAND_SPAN ? [] : pathSlice(model.lap, from, to).map(toPoint);

    const pos = interpolateXY(index, t);
    if (!pos || isOffTrackPlaceholder(pos)) return null;
    const focus = place(focusDriver, pos);
    if (!focus) return null;

    if (!focus.inPit) {
      state.pitEntry.current = null;
      const rejoin = pitRejoinView({
        gaps: rejoinGaps,
        pitLoss,
        track: trackVehicles,
        focusDriver,
        excluded,
        index,
        t,
      });
      if (!rejoin) return null;
      const carF = focus.fraction;

      const ghostOnLap = rejoin.ghost ? place(null, rejoin.ghost) : null;
      const behind = ghostOnLap && !ghostOnLap.inPit ? band(ghostOnLap.fraction, carF) : [];

      // Where the car was under the other conditions' pit loss.
      const markers: PitWindowMarker[] = [];
      for (const { condition, seconds } of alternativePitLosses(pitLoss, rejoin.condition)) {
        const at = t - seconds * 1000;
        if (index.times.length === 0 || index.times[0]! > at) continue;
        const xy = interpolateXY(index, at);
        if (!xy || isOffTrackPlaceholder(xy)) continue;
        const placed = place(null, xy);
        if (!placed || placed.inPit || forwardSpan(placed.fraction, carF) > MAX_BAND_SPAN) continue;
        const loc = locateOnPath(model.lap, placed.fraction);
        if (!loc) continue;
        const a = track.points[loc.i]!;
        const b = track.points[loc.j]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        markers.push({ condition, ...toPoint(loc), dx: (b.x - a.x) / len, dy: (b.y - a.y) / len });
      }

      let ahead: MapPoint[] = [];
      if (profile) {
        const carTf = timeAtDistance(profile, carF);
        const aheadF = distanceAtTime(
          profile,
          wrapFraction(carTf + (rejoin.lossS * 1000) / profile.lapMs),
        );
        ahead = band(carF, aheadF);
      }

      const rivals = pitWindowRivals(rejoinGaps, focusDriver, rejoin.lossS, excluded);
      const highlight = rivals ? new Set([...rivals.passedBy, ...rivals.dropBehind]) : NO_HIGHLIGHT;
      return {
        projection: rejoin.projection,
        lossS: rejoin.lossS,
        condition: rejoin.condition,
        inPit: false,
        ghost: rejoin.ghost,
        behind,
        ahead,
        markers,
        highlight,
      };
    }

    // Already in the pit lane: needs the reference lap to move the rejoin
    // point on at field speed.
    if (!profile) return null;
    const entry = cachedPitEntry(
      state.pitEntry,
      model,
      track.geom,
      focusDriver,
      index,
      t,
      RING_PIT_ENTRY_LOOKBACK_MS,
    );
    if (!entry) return null;
    const timeFractions = new Map<number, number>();
    for (const [num, idx] of indexes) {
      if (num === focusDriver || excluded?.has(num)) continue;
      const p = interpolateXY(idx, t);
      if (!p || isOffTrackPlaceholder(p)) continue;
      const placed = place(num, p);
      if (placed && !placed.inPit) timeFractions.set(num, timeAtDistance(profile, placed.fraction));
    }
    const rejoin = inPitRejoin({
      driver: focusDriver,
      entry,
      entryTf: timeAtDistance(profile, entry.fraction),
      t,
      lapMs: profile.lapMs,
      pitLoss,
      track: trackVehicles,
      timeFractions,
      gaps: rejoinGaps,
      excluded,
    });
    if (!rejoin) return null;
    const ghostLoc = locateOnPath(model.lap, distanceAtTime(profile, wrapFraction(rejoin.behindTf)));
    const highlight = new Set<number>();
    for (const n of [rejoin.projection.ahead, rejoin.projection.behind]) {
      if (n) highlight.add(n.driverNumber);
    }
    return {
      projection: rejoin.projection,
      lossS: rejoin.lossS,
      condition: rejoin.condition,
      inPit: true,
      ghost: ghostLoc ? toPoint(ghostLoc) : null,
      behind: [],
      ahead: [],
      markers: [],
      highlight,
    };
  }, [model, track, pitLoss, rejoinGaps, focusDriver, indexes, t, trackVehicles, excluded, profile]);

  // Same cars as last tick: keep the set's identity so car layers don't redraw.
  const highlightKey = result ? [...result.highlight].sort((a, b) => a - b).join(",") : "";
  const highlight = useMemo(
    () => (highlightKey ? new Set(highlightKey.split(",").map(Number)) : NO_HIGHLIGHT),
    [highlightKey],
  );
  return useMemo(() => (result ? { ...result, highlight } : null), [result, highlight]);
}
