import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CircleHelp } from "lucide-react";
import type { Driver, Interval, Lap, Location, Pit, Stint, Weather } from "@/api/types";
import { teamColor } from "@/utils/color";
import { cleanRaceLaps, type NeutralisedWindow, type PaceLap } from "@/utils/racePace";
import {
  speedUnitLabel,
  temperatureUnitLabel,
  toDisplaySpeed,
  toDisplayTemperature,
  toDisplayWindSpeed,
  windSpeedUnitLabel,
} from "@/utils/units";
import { ErrorMessage } from "@/components/ErrorMessage";
import { RainLayer } from "@/components/TrackMap/layers/RainLayer";
import {
  RING_LABEL_MIN_GAP,
  RING_LABEL_RADIUS,
  FLAG_COLORS,
  RING_PIT_ENTRY_LOOKBACK_MS,
  RING_PIT_RADIUS,
  RING_RADIUS,
  RING_REF_REFRESH_MS,
  RING_ZOOM_MAX,
  RING_ZOOM_MIN,
  RING_SVG_H,
  RING_SVG_W,
  TRACK_WHEEL_LINE_PIXELS,
  TRACK_WHEEL_MAX_DELTA,
  TRACK_WHEEL_ZOOM_PER_PIXEL,
} from "@/constants";
import { getPitLane } from "@/data/pitLanes";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useStartLightsSound } from "@/hooks/useStartLightsSound";
import { isOffTrackPlaceholder, useTrackOutline } from "@/hooks/useTrackMap";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { buildDriverIndexes, interpolateXY } from "@/timeline/interpolate";
import {
  alternativePitLosses,
  parsePitLoss,
  pitRejoinView,
  pitWindowRivals,
  type PitRejoinNeighbour,
} from "@/utils/pitRejoin";
import {
  isActiveTrackFlag,
  projectToTimingSectors,
  type TrackFlagState,
  type PitLaneStatus,
} from "@/timeline/raceControl";
import { startLightsState } from "@/timeline/startLights";
import { exportTrackSnapshot } from "../TrackMap/exportSnapshot";
import { MapBackground } from "../TrackMap/layers/MapBackground";
import { FocusedDriverHud } from "../TrackMap/overlays/FocusedDriverHud";
import { TrackClockPanel } from "../TrackMap/overlays/InfoPanels";
import { SectorChips } from "../TrackMap/overlays/MapCornerWidgets";
import { PitRejoinPanel } from "../TrackMap/overlays/PitRejoinPanel";
import { StartReplayHint } from "../TrackMap/overlays/StartReplayHint";
import { StatusBadges } from "../TrackMap/overlays/StatusBadges";
import { TrackControls, type TrackControlButton } from "../TrackMap/overlays/TrackControls";
import { buildStatusBadges, type ActiveTrackVehicles } from "../TrackMap/statusBadges";
import { buildTrackGeometry, carDataAt, projectToSvg } from "../TrackMap/trackGeometry";
import { mapBackgroundColor, overlayBackgroundColor, windDir } from "../TrackMap/trackMapFormat";
import {
  buildRingModel,
  createRingReferenceState,
  formatFocusGap,
  formatLapTime,
  formatRingGap,
  lapTimeFraction,
  layoutRingCars,
  nearbyRingDrivers,
  placeCar,
  signedTimeDelta,
  toDisplay,
  traceReferenceLaps,
  updateReferenceProfile,
  type RingCar,
  type RingScale,
} from "./ringModel";
import { cachedPitEntry, cleanRejoinGaps, createPitEntryCache, inPitRejoin } from "./pitWindow";
import {
  RingCars,
  RingCardinalDirections,
  RingCenter,
  RingGapMeasure,
  RingLegend,
  RingPitLane,
  RingPitWindow,
  RingTrack,
  type RingStatus,
} from "./RingLayers";

interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly previewTimeMs?: number;
  readonly sessionGmtOffset?: string | null;
  readonly focusDriver?: number | null;
  readonly pulseDrivers?: readonly number[];
  readonly circuitShortName?: string | null;
  readonly circuitKey?: number | null;
  readonly year?: number | null;
  readonly activeCompounds?: ReadonlyMap<number, { compound: Stint["compound"]; age: number }>;
  readonly focusCompound?: { compound: Stint["compound"]; age: number } | null;
  readonly laps?: readonly Lap[];
  readonly stints?: readonly Stint[];
  readonly pits?: readonly Pit[];
  readonly neutralised?: readonly NeutralisedWindow[];
  readonly positionByDriver?: ReadonlyMap<number, number> | null;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly weatherOverlay?: Weather | null;
  readonly weather?: Weather | null;
  readonly trackFlagState?: TrackFlagState | null;
  readonly pitLaneStatus?: PitLaneStatus | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly safetyCarSirenOn?: boolean;
  readonly showSectorBox?: boolean;
  readonly showFocusedHud?: boolean;
  /** True when the all-driver car_data window is already being fetched. */
  readonly sharedAllDriverWindow?: boolean;
  readonly telemetryEnabled?: boolean;
  readonly raceLeader?: Driver | null;
  /** Session-relative ms of race start; drives the start-lights badge. */
  readonly lightsOutMs?: number | null;
  readonly showTrackScreenshot?: boolean;
  /** Lap counter for the dial's centre ("21/52"). */
  readonly lapLabel?: string | null;
  /** Latest interval row per driver (races): gap labels. */
  readonly intervalRows?: ReadonlyMap<number, Pick<Interval, "interval" | "gap_to_leader">> | null;
  /** Latest gap to leader per driver; enables the focused car's pit window (races). */
  readonly pitRejoinGaps?: ReadonlyMap<number, number> | null;
  /** Current race leader (only they are labelled LEAD); null when unknown. */
  readonly leaderNumber?: number | null;
  readonly onSelectDriver?: (driverNumber: number) => void;
  readonly onOpenSettings?: () => void;
  /** Switch back to the 2D map. */
  readonly onEnter2d?: () => void;
  /** When set, shows a button that switches to the 3D map. */
  readonly onEnter3d?: () => void;
}

const CX = RING_SVG_W / 2;
const CY = RING_SVG_H / 2;

/**
 * Ring view: every circuit drawn as a circle, each car at the fraction of the
 * lap it has covered (start/finish at 12 o'clock, clockwise), cars in the pit
 * lane on an inner arc. Shares the 2D map's outline, overlays and settings.
 */
export function TrackRing({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  previewTimeMs,
  sessionGmtOffset = "+00:00",
  focusDriver = null,
  pulseDrivers,
  circuitShortName,
  circuitKey = null,
  year = null,
  activeCompounds,
  focusCompound,
  laps = [],
  stints = [],
  pits = [],
  neutralised = [],
  positionByDriver = null,
  battlingDrivers,
  retiredDrivers,
  weatherOverlay = null,
  weather = null,
  trackFlagState = null,
  pitLaneStatus = null,
  activeTrackVehicles = null,
  safetyCarSirenOn = false,
  showSectorBox = true,
  showFocusedHud = true,
  sharedAllDriverWindow = false,
  telemetryEnabled = true,
  raceLeader = null,
  lightsOutMs = null,
  showTrackScreenshot = true,
  lapLabel = null,
  intervalRows = null,
  pitRejoinGaps = null,
  leaderNumber = null,
  onSelectDriver,
  onOpenSettings,
  onEnter2d,
  onEnter3d,
}: Props) {
  const timelineT = useCoarseTime(100);
  const t = previewTimeMs ?? timelineT;
  const weatherEffects = useSettings((s) => s.mapWeatherEffectsEnabled);
  const tyreGuidance = useMemo(() => {
    if (!weatherOverlay) return null;

    const fastestLap = cleanRaceLaps({
      laps,
      stints,
      pits,
      neutralised,
      sessionStartMs,
      cutoffMs: t,
    }).reduce<PaceLap | null>((fastest, lap) => {
      if (lap.compound === "UNKNOWN") return fastest;
      if (!fastest || lap.lapS < fastest.lapS) return lap;
      return fastest;
    }, null);

    return {
      suggested: weatherOverlay.rainfall > 0 ? "INTERMEDIATE" : "SOFT",
      fastest: fastestLap?.compound ?? null,
    } as const;
  }, [weatherOverlay, laps, stints, pits, neutralised, sessionStartMs, t]);
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const showAcronym = useSettings((s) => s.mapShowDriverAcronym);
  const showNumberInside = useSettings((s) => s.mapShowDriverNumberInside);
  const showCornerNumbers = useSettings((s) => s.mapShowCornerNumbers);
  const mapShowRaceLeader = useSettings((s) => s.mapShowRaceLeader);
  const mapStartLightsSound = useSettings((s) => s.mapStartLightsSound);
  const mapShowClock = useSettings((s) => s.mapShowClock);
  const timeScale = useSettings((s) => s.mapRingTimeScale);
  const gapMode = useSettings((s) => s.mapRingGapMode);
  const reverse = useSettings((s) => s.mapRingReverse);
  const showPitWindowOutcomes = useSettings((s) => s.mapRingShowPitWindowOutcomes);
  const setSetting = useSettings((s) => s.setSetting);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  const isCompactViewport = useMediaQuery("(max-width: 767px)");
  const [hoverDriver, setHoverDriver] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const patternId = `ring-finish-checker-${sessionKey ?? "na"}`;
  const zoomStorageKey = useMemo(
    () => `f1-replay:ring-zoom:v1:${sessionKey ?? "none"}:${circuitKey ?? "none"}`,
    [sessionKey, circuitKey],
  );
  const persistZoomLevel = useCallback(
    (next: number) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(zoomStorageKey, String(next));
      } catch {
        // Ignore storage errors (private mode / quota).
      }
    },
    [zoomStorageKey],
  );

  const { data: circuitGeom, isPending: bakedPending } = useCircuitGeometry(circuitKey, year);
  const hasBaked = circuitGeom != null;
  const candidateDrivers = useMemo(
    () => (hasBaked || bakedPending ? null : drivers.map((d) => d.driver_number)),
    [drivers, hasBaked, bakedPending],
  );
  const { data: outline, isPending } = useTrackOutline(
    sessionKey,
    candidateDrivers,
    circuitKey,
    circuitShortName ?? null,
    undefined,
    year,
  );
  const trackGeometry = useMemo(() => (outline ? buildTrackGeometry(outline) : null), [outline]);

  const totalMarshalPosts = Math.max(
    circuitGeom?.marshalSectors?.length ?? 0,
    circuitGeom?.marshalLights?.length ?? 0,
    trackFlagState?.maxMarshalSector ?? 0,
  );
  const timingSectorFlags = useMemo(
    () => projectToTimingSectors(trackFlagState, totalMarshalPosts),
    [trackFlagState, totalMarshalPosts],
  );

  const model = useMemo(
    () =>
      trackGeometry && outline
        ? buildRingModel({
            geom: trackGeometry,
            circuitGeom: circuitGeom ?? null,
            pitLane: getPitLane(circuitKey),
            totalMarshalPosts: circuitGeom?.marshalSectors?.length ?? 0,
            toScale: outline.source !== "layout",
          })
        : null,
    [trackGeometry, outline, circuitGeom, circuitKey],
  );

  useEffect(() => {
    let next = 1;
    if (!isCompactViewport && typeof window !== "undefined") {
      try {
        const savedZoom = window.localStorage.getItem(zoomStorageKey);
        const parsedZoom = savedZoom === null ? Number.NaN : Number(savedZoom);
        if (Number.isFinite(parsedZoom)) {
          next = Math.min(RING_ZOOM_MAX, Math.max(RING_ZOOM_MIN, parsedZoom));
        }
      } catch {
        next = 1;
      }
    }
    zoomLevelRef.current = next;
    setZoomLevel(next);
  }, [isCompactViewport, zoomStorageKey]);

  const zoomBy = useCallback(
    (delta: number) => {
      const next = Math.min(
        RING_ZOOM_MAX,
        Math.max(RING_ZOOM_MIN, zoomLevelRef.current + delta),
      );
      if (next === zoomLevelRef.current) return;
      zoomLevelRef.current = next;
      setZoomLevel(next);
      persistZoomLevel(next);
      trackEvent("trackmap_zoom_changed", { zoom: next, view: "ring" });
    },
    [persistZoomLevel],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !model) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || !Number.isFinite(event.deltaY)) return;
      event.preventDefault();
      const pixels =
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? TRACK_WHEEL_LINE_PIXELS
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? svg.clientHeight
            : 1);
      const delta = Math.max(-TRACK_WHEEL_MAX_DELTA, Math.min(TRACK_WHEEL_MAX_DELTA, pixels));
      zoomBy(-delta * TRACK_WHEEL_ZOOM_PER_PIXEL);
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [model, zoomBy]);

  const driverByNumber = useMemo(() => new Map(drivers.map((d) => [d.driver_number, d])), [drivers]);
  const locationIndexes = useMemo(
    () => buildDriverIndexes(locationData, sessionStartMs),
    [locationData, sessionStartMs],
  );

  // Last matched lap segment per car: keeps the search local (and on the right
  // stretch where a track crosses itself). Reset with the geometry.
  const hintsRef = useRef(new Map<number, number>());
  // Pooled session laps and current pace behind the reference lap.
  const referenceRef = useRef(createRingReferenceState());
  // Pit entry of the focused car while it is in the pits (null entry: none
  // found within the lookback), so the location scan runs once per stop.
  const pitEntryRef = useRef(createPitEntryCache());
  useEffect(() => {
    hintsRef.current = new Map();
    referenceRef.current = createRingReferenceState();
    pitEntryRef.current = createPitEntryCache();
  }, [model]);

  const refBucket = Math.floor(t / RING_REF_REFRESH_MS);
  const profile = useMemo(() => {
    if (!timeScale || !model || !trackGeometry) return null;
    const tNow = refBucket * RING_REF_REFRESH_MS;
    const laps = traceReferenceLaps(model, trackGeometry, locationIndexes, tNow);
    return updateReferenceProfile(referenceRef.current, laps, tNow);
  }, [timeScale, model, trackGeometry, locationIndexes, refBucket]);
  const scale: RingScale = useMemo(() => ({ profile, reverse }), [profile, reverse]);

  const pitLoss = useMemo(() => parsePitLoss(circuitGeom?.pitLoss), [circuitGeom]);
  const rejoinGaps = useMemo(
    () => cleanRejoinGaps(pitRejoinGaps, leaderNumber),
    [pitRejoinGaps, leaderNumber],
  );
  // "Gap to the focused car" needs one; otherwise fall back to intervals.
  const focusGapRow = focusDriver === null ? undefined : intervalRows?.get(focusDriver);
  const effectiveGapMode = gapMode === "focus" && !focusGapRow ? "interval" : gapMode;
  const gapText = useMemo(() => {
    if (!intervalRows) return undefined;
    const out = new Map<number, string>();
    const isLeader = (num: number) => (leaderNumber === null ? undefined : num === leaderNumber);
    for (const [num, row] of intervalRows) {
      const text =
        effectiveGapMode === "focus"
          ? num === focusDriver
            ? null
            : formatFocusGap(row, focusGapRow, {
                rowIsLeader: isLeader(num),
                focusIsLeader: focusDriver === null ? undefined : isLeader(focusDriver),
              })
          : formatRingGap(row, effectiveGapMode, isLeader(num));
      if (text) out.set(num, text);
    }
    return out;
  }, [intervalRows, effectiveGapMode, leaderNumber, focusDriver, focusGapRow]);
  const focusAcronym =
    focusDriver === null ? null : (driverByNumber.get(focusDriver)?.name_acronym ?? `#${focusDriver}`);

  const chunkIdx = chunkIndexFor(t);
  const { data: hudRawData } = useCarDataWindow(
    sessionKey,
    showFocusedHud ? focusDriver : null,
    sessionStartMs,
    chunkIdx,
    { sharedAllDriverWindow, enabled: telemetryEnabled },
  );
  const hudData = useMemo(
    () => (focusDriver === null ? null : carDataAt(hudRawData, sessionStartMs + t)),
    [hudRawData, sessionStartMs, t, focusDriver],
  );

  const startLights = startLightsState(t, lightsOutMs);
  useStartLightsSound(startLights, mapStartLightsSound && lightsOutMs != null);

  const hasCars = locationIndexes.size > 0;
  const takeSnapshot = useCallback(() => {
    if (!svgRef.current) return;
    trackEvent("trackmap_snapshot_export", { format: "png", view: "ring" });
    exportTrackSnapshot(svgRef.current);
  }, []);

  if (!sessionKey) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        Select a session to load the track
      </div>
    );
  }
  if (isPending && !outline) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        Loading track outline…
      </div>
    );
  }
  if (!outline || !trackGeometry || !model) {
    return (
      <div className="w-full h-full">
        <ErrorMessage message="No location data available for this session" variant="empty" />
      </div>
    );
  }

  // Per tick: interpolate each car, then place it on the lap.
  const ringCars: RingCar[] = [];
  // Lap time fraction (before the flip) of every car on track.
  const timeFractions = new Map<number, number>();
  const hints = hintsRef.current;
  let focusInPit = false;
  for (const [num, idx] of locationIndexes) {
    if (retiredDrivers?.has(num)) continue;
    const pos = interpolateXY(idx, t);
    if (!pos || isOffTrackPlaceholder(pos)) continue;
    const { sx, sy } = projectToSvg(trackGeometry, pos.x, pos.y);
    const placed = placeCar(model, sx, sy, hints.get(num) ?? -1);
    if (!placed) continue;
    hints.set(num, placed.segment);
    ringCars.push({ num, fraction: toDisplay(scale, placed.fraction), inPit: placed.inPit });
    if (!placed.inPit) timeFractions.set(num, lapTimeFraction(scale, placed.fraction));
    else if (num === focusDriver) focusInPit = true;
  }
  if (!focusInPit) pitEntryRef.current.current = null;
  const focusTimeFraction = focusDriver === null ? null : (timeFractions.get(focusDriver) ?? null);
  const carLayout = layoutRingCars(ringCars, {
    cx: CX,
    cy: CY,
    ringR: RING_RADIUS,
    pitR: RING_PIT_RADIUS,
    labelR: RING_LABEL_RADIUS,
    minGap: RING_LABEL_MIN_GAP,
  });

  // Pit window: on a time dial the rejoin point is simply "now minus the
  // pit loss"; on the distance dial, where the car was that long ago.
  const rejoin =
    focusDriver !== null && focusTimeFraction !== null
      ? pitRejoinView({
          gaps: rejoinGaps,
          pitLoss,
          track: activeTrackVehicles,
          focusDriver,
          excluded: retiredDrivers,
          index: locationIndexes.get(focusDriver),
          t,
        })
      : null;
  let pitWindow: Omit<Parameters<typeof RingPitWindow>[0], "cx" | "cy" | "r" | "scale"> | null = null;
  let pitWindowRivalsResult: { passedBy: number[]; dropBehind: number[] } | null = null;
  const highlightDrivers = new Set<number>();
  if (rejoin && focusTimeFraction !== null && focusDriver !== null) {
    const lossTf = (s: number) => (profile ? (s * 1000) / profile.lapMs : null);
    let behindTf: number | null = null;
    const loss = lossTf(rejoin.lossS);
    if (loss !== null) {
      behindTf = focusTimeFraction - loss;
    } else if (rejoin.ghost) {
      const g = projectToSvg(trackGeometry, rejoin.ghost.x, rejoin.ghost.y);
      const placed = placeCar(model, g.sx, g.sy, -1);
      // Distance dial: time fraction = distance fraction.
      if (placed) behindTf = placed.fraction;
      // Keep the band running backwards from the car.
      if (behindTf !== null && behindTf > focusTimeFraction) behindTf -= 1;
    }
    if (behindTf !== null) {
      pitWindow = {
        carTf: focusTimeFraction,
        behindTf,
        aheadTf: loss === null ? null : focusTimeFraction + loss,
        markers:
          pitLoss && loss !== null
            ? alternativePitLosses(pitLoss, rejoin.condition).map(({ condition, seconds }) => ({
                condition,
                tf: focusTimeFraction - lossTf(seconds)!,
              }))
            : [],
        position: rejoin.projection.position,
        lossS: rejoin.lossS,
      };
      const rivals = rejoinGaps ? pitWindowRivals(rejoinGaps, focusDriver, rejoin.lossS, retiredDrivers) : null;
      pitWindowRivalsResult = rivals;
      for (const num of [...(rivals?.passedBy ?? []), ...(rivals?.dropBehind ?? [])]) highlightDrivers.add(num);
    }
  }

  // Already in the pits (time dial): the rejoin point is where the car would
  // be had it stayed out (its pit entry, moved on at field speed) minus the
  // pit loss, so it holds still against the field until the car rejoins.
  let inPitRejoinResult: ReturnType<typeof inPitRejoin> = null;
  const focusIndex = focusDriver === null ? undefined : locationIndexes.get(focusDriver);
  if (focusInPit && focusDriver !== null && focusIndex && profile && pitLoss && rejoinGaps?.has(focusDriver)) {
    const entry = cachedPitEntry(
      pitEntryRef.current,
      model,
      trackGeometry,
      focusDriver,
      focusIndex,
      t,
      RING_PIT_ENTRY_LOOKBACK_MS,
    );
    const rejoinInPit = entry
      ? inPitRejoin({
          driver: focusDriver,
          entry,
          entryTf: lapTimeFraction(scale, entry.fraction),
          t,
          lapMs: profile.lapMs,
          pitLoss,
          track: activeTrackVehicles,
          timeFractions,
          gaps: rejoinGaps,
          excluded: retiredDrivers,
        })
      : null;
    if (rejoinInPit) {
      const { projection } = rejoinInPit;
      inPitRejoinResult = rejoinInPit;
      pitWindow = {
        carTf: rejoinInPit.carTf,
        behindTf: rejoinInPit.behindTf,
        aheadTf: null,
        markers: [],
        position: projection.position,
        lossS: rejoinInPit.lossS,
        inPit: true,
      };
      for (const n of [projection.ahead, projection.behind]) if (n) highlightDrivers.add(n.driverNumber);
    }
  }

  // Inspecting a focused or hovered car emphasizes the closest two cars on
  // either side, while preserving the pit-window and gap-measure highlights.
  const inspectedDriver = hoverDriver ?? focusDriver;
  if (inspectedDriver !== null && timeFractions.has(inspectedDriver)) {
    highlightDrivers.add(inspectedDriver);
    for (const num of nearbyRingDrivers(timeFractions, inspectedDriver)) highlightDrivers.add(num);
  }

  // Gap measure: the on-track time between the focused car and the hovered one.
  let measure: { fromTf: number; toTf: number; gapMs: number } | null = null;
  const hoverTf = hoverDriver === null ? undefined : timeFractions.get(hoverDriver);
  if (profile && focusTimeFraction !== null && hoverTf !== undefined && hoverDriver !== focusDriver) {
    measure = {
      fromTf: focusTimeFraction,
      toTf: hoverTf,
      gapMs: Math.abs(signedTimeDelta(focusTimeFraction, hoverTf)) * profile.lapMs,
    };
    highlightDrivers.add(hoverDriver!);
  }

  const overlayBackground = overlayBackgroundColor(lightMode);
  const status = ringStatus(trackFlagState, activeTrackVehicles, lapLabel != null);
  const reference = profile
    ? {
        title: `Reference lap ${formatLapTime(profile.lapMs)}`,
      }
    : {
        title: "Spaced by distance",
      };
  const focusDriverData = focusDriver === null ? undefined : driverByNumber.get(focusDriver);
  const pitRejoinPanel = inPitRejoinResult
    ? {
        projection: inPitRejoinResult.projection,
        lossS: inPitRejoinResult.lossS,
        condition: inPitRejoinResult.condition,
        inPit: true,
      }
    : rejoin
      ? {
          projection: rejoin.projection,
          lossS: rejoin.lossS,
          condition: rejoin.condition,
          inPit: false,
        }
      : null;
  const focusPosition = focusDriver === null ? null : (positionByDriver?.get(focusDriver) ?? null);
  const focusTyre = focusDriver === null ? undefined : focusCompound ?? activeCompounds?.get(focusDriver);
  const focusGapAhead =
    focusDriver === null
      ? null
      : formatRingGap(
          focusGapRow,
          "interval",
          focusDriver === leaderNumber || focusPosition === 1,
        );
  const focusBehindDriver =
    focusPosition === null
      ? null
      : Array.from(positionByDriver ?? []).find(([, position]) => position === focusPosition + 1)?.[0] ?? null;
  const focusGapBehind =
    focusBehindDriver === null
      ? null
      : formatRingGap(intervalRows?.get(focusBehindDriver), "interval", false);
  const focusHud = hudData
    ? `${Math.round(toDisplaySpeed(hudData.speed, metricSystem))} ${speedUnitLabel(metricSystem)} · G${
        hudData.n_gear === 0 ? "N" : hudData.n_gear
      }`
    : null;
  const focusInfo =
    focusDriver === null
      ? null
      : {
          number: focusDriver,
          acronym: focusDriverData?.name_acronym ?? `#${focusDriver}`,
          position: focusPosition,
          color: teamColor(focusDriverData?.team_colour, "#ffffff"),
          gapAhead: focusGapAhead,
          gapBehind: focusGapBehind,
          compound: focusTyre?.compound ?? null,
          tyreAge: focusTyre?.age ?? null,
          speed: focusHud,
        };
  const centerWeather =
    focusDriver === null && weatherOverlay
      ? {
          track: `${toDisplayTemperature(weatherOverlay.track_temperature, metricSystem).toFixed(0)}°${temperatureUnitLabel(metricSystem)}`,
          air: `${toDisplayTemperature(weatherOverlay.air_temperature, metricSystem).toFixed(0)}°${temperatureUnitLabel(metricSystem)}`,
          humidity: `${weatherOverlay.humidity}%`,
          wind: `${toDisplayWindSpeed(weatherOverlay.wind_speed, metricSystem).toFixed(0)} ${windSpeedUnitLabel(metricSystem)} ${windDir(weatherOverlay.wind_direction)}`,
          raining: weatherOverlay.rainfall > 0,
        }
      : null;
  const extraButtons: TrackControlButton[] = [
    {
      key: "legend",
      title: legendOpen ? "Hide ring legend" : "Show ring legend",
      icon: <CircleHelp size={14} strokeWidth={2.2} aria-hidden />,
      active: legendOpen,
      onPress: () => setLegendOpen((open) => !open),
    },
  ];
  if (gapText) {
    // Cycle: car ahead → leader → focused car (when there is one) → car ahead.
    const nextGapMode =
      effectiveGapMode === "interval"
        ? "leader"
        : effectiveGapMode === "leader" && focusGapRow
          ? "focus"
          : "interval";
    extraButtons.unshift({
      key: "gap",
      title:
        nextGapMode === "leader"
          ? "Show gap to the leader"
          : nextGapMode === "focus"
            ? `Show gap to ${focusAcronym}`
            : "Show gap to the car ahead",
      icon: <ArrowLeftRight size={14} strokeWidth={2.2} aria-hidden />,
      onPress: () => setSetting("mapRingGapMode", nextGapMode),
    });
  }
  const hasTrackConditionDisplay =
    isActiveTrackFlag(trackFlagState?.globalFlag) ||
    timingSectorFlags[1] != null ||
    timingSectorFlags[2] != null ||
    timingSectorFlags[3] != null;
  const statusBadges = buildStatusBadges({
    startLights,
    activeTrackVehicles,
    trackFlagState,
    timingSectorFlags,
    raceLeader: mapShowRaceLeader ? raceLeader : null,
    lightMode,
  });

  return (
    <div className="relative w-full h-full">
      <StatusBadges badges={statusBadges} />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${RING_SVG_W} ${RING_SVG_H}`}
        className="w-full h-full"
        style={{ background: mapBackgroundColor(lightMode) }}
        role="img"
        aria-label="Ring view: cars by lap progress"
      >
        <defs>
          <pattern id={patternId} width="3" height="3" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#ffffff" />
            <rect x="0" y="0" width="1.5" height="1.5" fill="#111111" />
            <rect x="1.5" y="1.5" width="1.5" height="1.5" fill="#111111" />
          </pattern>
        </defs>
        <RainLayer
          enabled={weatherEffects}
          weather={weather}
          view={{ x: 0, y: 0, w: RING_SVG_W, h: RING_SVG_H }}
          preview={previewTimeMs !== undefined}
        />
        <g
          data-testid="ring-zoom-layer"
          transform={`translate(${CX} ${CY}) scale(${zoomLevel}) translate(${-CX} ${-CY})`}
        >
          <MapBackground
            view={{ x: 0, y: 0, w: RING_SVG_W, h: RING_SVG_H }}
            lightMode={lightMode}
            ring={{
              cx: CX,
              cy: CY,
              radius: RING_RADIUS,
              rotationDeg: circuitGeom?.rotation ?? 0,
            }}
          />
          <RingCenter
            cx={CX}
            cy={CY}
            lapLabel={lapLabel && lapLabel !== "—" ? lapLabel : null}
            status={status}
            reference={reference}
            focusInfo={focusInfo}
            weather={centerWeather}
            tyreGuidance={tyreGuidance}
            lightMode={lightMode}
          />
          <RingPitLane
            cx={CX}
            cy={CY}
            r={RING_PIT_RADIUS}
            ringR={RING_RADIUS}
            model={model}
            scale={scale}
            lightMode={lightMode}
            pitLaneStatus={pitLaneStatus}
          />
          <RingTrack
            cx={CX}
            cy={CY}
            r={RING_RADIUS}
            model={model}
            scale={scale}
            timingSectorFlags={trackFlagState ? timingSectorFlags : null}
            showCornerNumbers={showCornerNumbers}
            patternId={patternId}
            lightMode={lightMode}
          />
          {pitWindow && <RingPitWindow cx={CX} cy={CY} r={RING_RADIUS} scale={scale} {...pitWindow} />}
          {measure && (
            <RingGapMeasure cx={CX} cy={CY} r={RING_RADIUS} scale={scale} lightMode={lightMode} {...measure} />
          )}
          <RingCardinalDirections
            cx={CX}
            cy={CY}
            rotationDeg={circuitGeom?.rotation ?? 0}
            lightMode={lightMode}
          />
          <RingCars
            cars={carLayout}
            gapText={gapText}
            driverByNumber={driverByNumber}
            focusDriver={focusDriver}
            highlightDrivers={highlightDrivers}
            pulseDrivers={pulseDrivers}
            battlingDrivers={battlingDrivers}
            activeCompounds={activeCompounds}
            safetyCarSirenOn={safetyCarSirenOn}
            lightMode={lightMode}
            showAcronym={showAcronym}
            showNumberInside={showNumberInside}
            onSelectDriver={onSelectDriver}
            onHoverDriver={setHoverDriver}
          />
        </g>
      </svg>

      {!hasCars && <StartReplayHint />}

      <TrackControls
        quickSettingsView="ring"
        showTrackControls={false}
        onRotateLeft={noop}
        onRotateRight={noop}
        onZoomOut={noop}
        onZoomIn={noop}
        onResetView={noop}
        onSnapshot={showTrackScreenshot ? takeSnapshot : undefined}
        snapshotDisabled={!hasCars}
        onOpenSettings={onOpenSettings}
        onEnter2d={onEnter2d}
        onEnter3d={onEnter3d}
        extraButtons={extraButtons}
      />

      {showPitWindowOutcomes && pitWindow && pitWindowRivalsResult && (
        <div
          role="status"
          aria-label="Pit window outcomes"
          className="absolute top-12 right-2 z-20 max-w-[min(18rem,calc(100%-1rem))] rounded-sm border border-purple-line bg-track/90 px-2.5 py-2 text-caption leading-snug text-fg shadow-lg backdrop-blur"
        >
          <p className="font-black uppercase tracking-wider text-purple-fg">If {focusAcronym} pits now</p>
          <p className="mt-1">
            <span className="font-bold">Would pass:</span>{" "}
            {driverList(pitWindowRivalsResult.passedBy, driverByNumber)}
          </p>
          <p>
            <span className="font-bold">Would drop behind if they pit:</span>{" "}
            {driverList(pitWindowRivalsResult.dropBehind, driverByNumber)}
          </p>
        </div>
      )}

      {showPitWindowOutcomes && inPitRejoinResult && (
        <div
          role="status"
          aria-label="Pit rejoin"
          className="absolute top-12 right-2 z-20 max-w-[min(18rem,calc(100%-1rem))] rounded-sm border border-purple-line bg-track/90 px-2.5 py-2 text-caption leading-snug text-fg shadow-lg backdrop-blur"
        >
          <p className="font-black uppercase tracking-wider text-purple-fg">
            {focusAcronym} in the pits → P{inPitRejoinResult.projection.position}
          </p>
          <p className="mt-1">
            <span className="font-bold">Rejoins behind:</span> {neighbourText(inPitRejoinResult.projection.ahead, driverByNumber)}
          </p>
          <p>
            <span className="font-bold">Ahead of:</span> {neighbourText(inPitRejoinResult.projection.behind, driverByNumber)}
          </p>
        </div>
      )}

      {legendOpen && (
        <div className="absolute top-12 right-2 z-30">
          <RingLegend />
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-20 pointer-events-none flex flex-col gap-1">
        {mapShowClock && (
          <TrackClockPanel
            nowMs={sessionStartMs + Math.max(0, t)}
            sessionGmtOffset={sessionGmtOffset}
            raining={(weatherOverlay?.rainfall ?? 0) > 0}
          />
        )}
      </div>

      {focusDriver !== null &&
        ((showFocusedHud && hudData) || pitRejoinPanel) && (
          <div className="absolute top-2 left-2 pointer-events-none flex flex-col gap-1">
            {showFocusedHud && hudData && (
              <FocusedDriverHud
                sample={hudData}
                driver={focusDriverData}
                metricSystem={metricSystem}
              />
            )}
            {pitRejoinPanel && (
              <PitRejoinPanel
                {...pitRejoinPanel}
                pitLoss={circuitGeom?.pitLoss}
                color={teamColor(focusDriverData?.team_colour, "#ffffff")}
                driverByNumber={driverByNumber}
              />
            )}
          </div>
      )}

      {hasCars && (
        showSectorBox &&
        hasTrackConditionDisplay && (
          <div className="absolute bottom-2 right-2 z-20">
            <SectorChips timingSectorFlags={timingSectorFlags} overlayBackground={overlayBackground} />
          </div>
        )
      )}
    </div>
  );
}

function noop() {}

function driverList(numbers: readonly number[], drivers: ReadonlyMap<number, Driver>): string {
  if (numbers.length === 0) return "None";
  const names = numbers.slice(0, 3).map((num) => drivers.get(num)?.name_acronym ?? `#${num}`);
  if (numbers.length > names.length) names.push(`+${numbers.length - names.length} more`);
  return names.join(", ");
}

function neighbourText(n: PitRejoinNeighbour | null, drivers: ReadonlyMap<number, Driver>): string {
  if (!n) return "None";
  return `${drivers.get(n.driverNumber)?.name_acronym ?? `#${n.driverNumber}`} by ${n.gapS.toFixed(1)}s`;
}

/** Track status chip for the dial's centre. */
function ringStatus(
  flags: TrackFlagState | null,
  vehicles: ActiveTrackVehicles | null,
  race: boolean,
): RingStatus | null {
  if (vehicles?.chequeredFlag) return { label: "Chequered", color: "#f2f4fb" };
  if (vehicles?.formationLap) return { label: "Formation lap", color: "#9aa4be" };
  if (flags?.globalFlag === "RED") return { label: "Red flag", color: FLAG_COLORS.RED! };
  if (vehicles?.safetyCar) return { label: "Safety Car", color: FLAG_COLORS.SAFETY_CAR! };
  if (vehicles?.vsc) return { label: "VSC", color: FLAG_COLORS.VIRTUAL_SC! };
  if (flags?.globalFlag === "YELLOW" || flags?.globalFlag === "DOUBLE_YELLOW") {
    return { label: "Yellow", color: FLAG_COLORS.YELLOW! };
  }
  return race ? { label: "Green", color: FLAG_COLORS.GREEN! } : null;
}
