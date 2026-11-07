import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Camera,
  CircleDot,
  Crosshair,
  Flame,
  Gauge,
  Maximize,
  Navigation,
  Orbit,
  Settings as SettingsIcon,
  Tv,
  Video,
} from "lucide-react";
import type { Driver, Location, Weather } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { StatusBadges } from "@/components/TrackMap/overlays/StatusBadges";
import {
  TrackClockPanel,
  WeatherPanel,
} from "@/components/TrackMap/overlays/InfoPanels";
import { FocusedDriverHud } from "@/components/TrackMap/overlays/FocusedDriverHud";
import { PitRejoinPanel } from "@/components/TrackMap/overlays/PitRejoinPanel";
import {
  buildStatusBadges,
  type ActiveTrackVehicles,
} from "@/components/TrackMap/statusBadges";
import {
  buildBrakingHotspots,
  buildDeltaSegments,
  buildElevationSegments,
  buildHeatSegments,
  buildTrackGeometry,
  carDataAt,
} from "@/components/TrackMap/trackGeometry";
import { usePitWindow } from "@/components/TrackMap/usePitWindow";
import { TRACK_CONTROL_SURFACE } from "@/components/TrackMap/overlays/TrackControls";
import { overlayBackgroundColor } from "@/components/TrackMap/trackMapFormat";
import {
  MAP3D_CHASE_ALPHA,
  MAP3D_ONBOARD_ALPHA,
  MAP3D_ONBOARD_HEADING_MS,
  MAP3D_FRAME_BUDGET_MS,
  MAP3D_FLAG_WIDTH_M,
  MAP3D_FOLLOW_BEARING_ALPHA,
  MAP3D_FOLLOW_CENTER_ALPHA,
  MAP3D_FOLLOW_PITCH,
  MAP3D_FOLLOW_ZOOM,
  MAP3D_HEADING_LOOKBACK_MS,
  MAP3D_OVERVIEW_PITCH,
  MAP3D_STYLE_URL,
  MAP3D_SURFACE_MIN_ZOOM,
  MAP3D_TERRAIN_EXAGGERATION,
  MAP3D_TRACK_WIDTH_M,
  MAP3D_DIRECTOR_FADE_MS,
  MAP3D_GAP_RIBBON_MAX_M,
  MAP3D_TRAIL_MS,
  MAP3D_TRAIL_SPEED_MAX_GAP_MS,
  MAP3D_TRAIL_STEP_MS,
  MAP3D_EDGE_LINE_COLOR,
  TRACK_PIT_ACCESS_MARKER_RADIUS,
} from "@/constants";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import { getRunoffStyle } from "@/data/circuitRunoff";
import { getPitLane } from "@/data/pitLanes";
import { buildRingModel } from "@/components/TrackRing/ringModel";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useStartLightsSound } from "@/hooks/useStartLightsSound";
import { computeTrackBounds, isOffTrackPlaceholder } from "@/hooks/useTrackMap";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { useTimeline } from "@/timeline/clock";
import { TOKEN_HEX } from "@/designTokens";
import type { PitLaneStatus } from "@/timeline/raceControl";
import {
  INITIAL_DIRECTOR_STATE,
  battlePairs,
  cameraForShot,
  pickShot,
  positionsAt,
  sameShot,
  shotCaption,
  type BattleGap,
  type DirectorData,
  type DirectorShot,
  type DirectorState,
} from "@/timeline/director";
import { buildDriverIndexes, interpolateXY } from "@/timeline/interpolate";
import {
  projectToTimingSectors,
  type TrackFlagState,
} from "@/timeline/raceControl";
import { startLightsState } from "@/timeline/startLights";
import { teamColor } from "@/utils/color";
import { enuToLngLat, f1ToEnu, f1ToLngLat } from "@/utils/georef";
import { TOUR_TARGET } from "@/components/AppTour/targets";
import {
  addOverlayLayers,
  ensureGhostIcon,
  setOverlayGradients,
  setOverlayVisibility,
  SRC_GHOST,
  SRC_HOTSPOTS,
  SRC_GAP_LABELS,
  SRC_GAP_RIBBONS,
  SRC_PIT_LABELS,
  SRC_PIT_TICKS,
  SRC_PIT_WINDOW,
  SRC_TRAIL,
  LAYER_TRAIL,
} from "./overlayLayers";
import {
  buildArcPolyline,
  buildGapRibbons,
  buildHotspotPoints,
  buildPitWindowFeatures,
  buildTrailPath,
  gradientFromSegments,
  heatColors,
  speedLookup,
  trailFeature,
  trailGradient,
  trailSpeedGradient,
} from "./trackOverlays";
import {
  isBrightPreset,
  lightPresetAt,
  lightPresetForTheme,
  rainFogFor,
  rainFor,
  type LightPreset,
} from "./atmosphere";
import { mapboxToken } from "./availability";
import {
  addSectorLayers,
  addTrackSurfaceLayers,
  applySectorFlags,
  applyTrackPalette,
  fadeOut,
  setSectorRibbonVisibility,
} from "./surfaceLayers";
import {
  buildFlagZones,
  buildSectorZones,
  buildTrackSurface,
} from "./trackSurface";
import { buildTrackside } from "./trackside";
import {
  addTracksideLayers,
  applyTracksidePalette,
  setTracksideVisibility,
} from "./tracksideLayers";
import { createFrameProbe, map3dDebugEnabled } from "./frameProbe";
import {
  cameraTime,
  canSendCars,
  createCarSync,
  markCarsSent,
  markCarsShown,
} from "./carSync";
import {
  CAMERA_MODES,
  CAMERA_MODES_WITH_TV,
  chasePose,
  frameAlpha,
  nextCameraMode,
  onboardPose,
  orbitBearing,
  type CameraMode,
} from "./cameraModes";
import { exportMapSnapshot } from "./exportSnapshot3d";
import { MiniMap } from "./MiniMap";
import { buildMiniMapProjection } from "./miniMapProjection";
import {
  animatedCarPaint,
  buildCarFeatures,
  buildCarLayers,
  CAR_DOT_LAYER,
  CAR_MODEL_ID,
  CAR_SOURCE,
  carScaleFor,
  clearCarIcons,
  ensureCarIcons,
  type CarFeatureInput,
} from "./carLayers";
import {
  broadcastBearing,
  buildCornerPoints,
  buildMarshalSectorLines,
  buildPitLaneLine,
  buildTrackLine,
  groundWidthExpression,
  headingDeg,
  lerpAngleDeg,
  marshalSegmentColor,
  trackBounds,
  type FeatureCollection,
  type PointFeature,
} from "./mapFeatures";

const SRC_TRACK = "map3d-track";
const SRC_MARSHAL = "map3d-marshal";
const SRC_FLAG_ZONES = "map3d-flag-zones";
const SRC_CORNERS = "map3d-corners";
const SRC_PIT_LANE = "map3d-pit-lane";
const SRC_DEM = "map3d-dem";
const LAYER_TRACK_SURFACE = "map3d-track-surface";
const LAYER_CORNERS = "map3d-corners";
/** Overview fit: clear the control bar on top and the Mapbox logo below. */
const FIT_PADDING = { top: 48, bottom: 40, left: 12, right: 12 };
/** Minimap longest side (px): desktop / phone. */
const MINIMAP_SIZE = 150;
const MINIMAP_SIZE_COMPACT = 96;
const MINIMAP_PAD = 8;

const CAMERA_LABELS: Record<CameraMode, string> = {
  follow: "follow",
  chase: "chase",
  onboard: "onboard",
  orbit: "orbit",
  tv: "TV director",
};

/**
 * Standard style options: keep place names for orientation, drop what
 * competes with the track (POIs, transit, route shields, the Monaco–France
 * border, footpaths).
 */
const BASEMAP_CONFIG = {
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  showPedestrianRoads: false,
  showRoadLabels: false,
  showAdminBoundaries: false,
} as const;

/** Phones skip 3D trees: the biggest GPU cost in dense street circuits. */
const COMPACT_BASEMAP_CONFIG = { show3dTrees: false } as const;


/** Track ribbon fill; must stand out from Standard's grey roads in every preset. */
const ribbonColorFor = (preset: LightPreset) =>
  isBrightPreset(preset) ? "#1f2633" : "#3a4458";

/** Style setters typed by name; our property names come from built specs. */
interface StyleSetters {
  setPaintProperty(layer: string, name: string, value: unknown): void;
  setLayoutProperty(layer: string, name: string, value: unknown): void;
}

/** Add the car layers, or restyle them in place after a resize / theme change. */
function applyCarLayers(map: mapboxgl.Map, scale: number) {
  const style = map as unknown as StyleSetters;
  const models = useSettings.getState().mapView3dCarModels;
  for (const layer of buildCarLayers(scale, performance.now(), { models })) {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
      continue;
    }
    const { paint = {}, layout = {} } = layer as {
      paint?: Record<string, unknown>;
      layout?: Record<string, unknown>;
    };
    for (const [key, value] of Object.entries(paint)) {
      style.setPaintProperty(layer.id, key, value);
    }
    for (const [key, value] of Object.entries(layout)) {
      style.setLayoutProperty(layer.id, key, value);
    }
  }
}

const emptyCollection = (): FeatureCollection<PointFeature> => ({
  type: "FeatureCollection",
  features: [],
});

interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly previewTimeMs?: number;
  readonly sessionGmtOffset?: string | null;
  readonly focusDriver?: number | null;
  readonly circuitKey?: number | null;
  readonly year?: number | null;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly pulseDrivers?: readonly number[];
  readonly activeCompounds?: CarFeatureInput["activeCompounds"];
  readonly safetyCarSirenOn?: boolean;
  /** Weather panel data (null when the panel setting is off). */
  readonly weatherOverlay?: Weather | null;
  /** Weather at the playhead for map effects (rain), independent of the panel. */
  readonly weather?: Weather | null;
  readonly trackFlagState?: TrackFlagState | null;
  readonly pitLaneStatus?: PitLaneStatus | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly showTrackControls?: boolean;
  readonly showEnhancedVisuals?: boolean;
  readonly showTrackScreenshot?: boolean;
  /** Focused driver's current lap; drives speed heat / delta / braking overlays. */
  readonly focusDriverLap?: number | null;
  /** Latest gap to leader per driver; enables the pit rejoin ghost (races only). */
  readonly pitRejoinGaps?: ReadonlyMap<number, number> | null;
  /** Current race leader; stale 0 s gaps on other cars are ignored. */
  readonly leaderNumber?: number | null;
  readonly showFocusedHud?: boolean;
  readonly sharedAllDriverWindow?: boolean;
  readonly telemetryEnabled?: boolean;
  readonly raceLeader?: Driver | null;
  readonly lightsOutMs?: number | null;
  /** Auto-director inputs (races only); enables the "TV" camera mode. */
  readonly director?: DirectorData | null;
  /** Battles within 1 s with their interval, for the gap ribbons (races only). */
  readonly battleGaps?: readonly BattleGap[] | null;
  /** Camera mode to start in (e.g. from `?cam=`); later changes are reported. */
  readonly initialCameraMode?: CameraMode;
  readonly onCameraModeChange?: (mode: CameraMode) => void;
  readonly onSelectDriver?: (driverNumber: number) => void;
  readonly onOpenSettings?: () => void;
  /** Switch back to the 2D map. */
  readonly onExit3d: () => void;
  /** When set, shows a button that switches to the ring (lap progress) view. */
  readonly onEnterRing?: () => void;
}

/**
 * 3D track map on Mapbox GL: Standard basemap with terrain, the baked
 * circuit centerline georeferenced onto it, marshal-post flag colouring and
 * live car markers. Cars and the follow camera run in their own RAF loop that
 * reads the clock store directly; React only re-renders the HTML overlays.
 */
export function TrackMap3D({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  previewTimeMs,
  sessionGmtOffset = "+00:00",
  focusDriver = null,
  circuitKey = null,
  year = null,
  battlingDrivers,
  retiredDrivers,
  pulseDrivers,
  activeCompounds,
  safetyCarSirenOn = false,
  weatherOverlay = null,
  weather = null,
  trackFlagState = null,
  pitLaneStatus = null,
  activeTrackVehicles = null,
  showTrackControls = true,
  showTrackScreenshot = true,
  showEnhancedVisuals = true,
  focusDriverLap = null,
  pitRejoinGaps = null,
  leaderNumber = null,
  showFocusedHud = true,
  sharedAllDriverWindow = false,
  telemetryEnabled = true,
  raceLeader = null,
  lightsOutMs = null,
  director = null,
  battleGaps = null,
  initialCameraMode = "follow",
  onCameraModeChange,
  onSelectDriver,
  onOpenSettings,
  onExit3d,
  onEnterRing,
}: Props) {
  const timelineT = useCoarseTime(100);
  const t = previewTimeMs ?? timelineT;
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const mapShowCornerNumbers = useSettings((s) => s.mapShowCornerNumbers);
  const mapShowRaceLeader = useSettings((s) => s.mapShowRaceLeader);
  const mapStartLightsSound = useSettings((s) => s.mapStartLightsSound);
  const mapShowClock = useSettings((s) => s.mapShowClock);
  const mapShowDriverAcronym = useSettings((s) => s.mapShowDriverAcronym);
  const mapShowElevation = useSettings((s) => s.mapShowElevation);
  const sessionLighting = useSettings((s) => s.mapView3dSessionLighting);
  const terrainEnabled = useSettings((s) => s.mapView3dTerrain);
  const flagColorsEnabled = useSettings((s) => s.mapView3dFlagColors);
  const sectorRibbonEnabled = useSettings((s) => s.mapView3dSectorRibbon);
  const weatherEffectsEnabled = useSettings((s) => s.mapView3dWeatherEffects);
  const buildingsEnabled = useSettings((s) => s.mapView3dBuildings);
  const tracksideEnabled = useSettings((s) => s.mapView3dTrackside);
  const carModelsEnabled = useSettings((s) => s.mapView3dCarModels);
  const speedTrailEnabled = useSettings((s) => s.mapView3dSpeedTrail);
  const battleGapsEnabled = useSettings((s) => s.mapView3dBattleGaps);
  const followFocused = useSettings((s) => s.mapFollowFocusedCar);
  const showHeatmap = useSettings((s) => s.mapShowDriverHeatmap);
  const setSetting = useSettings((s) => s.setSetting);
  const mapShowDriverNumberInside = useSettings(
    (s) => s.mapShowDriverNumberInside,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [followSuspended, setFollowSuspended] = useState(false);
  const token = mapboxToken();

  const geo = useMemo(() => getCircuitGeoref(circuitKey, year), [circuitKey, year]);
  const { data: circuitGeom } = useCircuitGeometry(circuitKey, year);

  // Light preset: the sun at the circuit at the playhead's instant (night
  // races look like night), or the app theme when that's turned off.
  const lightPreset: LightPreset =
    sessionLighting && geo && sessionStartMs > 0
      ? lightPresetAt(sessionStartMs + t, geo.originLat, geo.originLng)
      : lightPresetForTheme(lightMode);
  const circuitKeyRef = useRef(circuitKey);
  circuitKeyRef.current = circuitKey;
  // Wet asphalt follows the weather-effects setting, like the rain itself.
  const wetTrack = weatherEffectsEnabled && ((weather ?? weatherOverlay)?.rainfall ?? 0) > 0;
  const wetTrackRef = useRef(wetTrack);
  wetTrackRef.current = wetTrack;
  const lightPresetRef = useRef(lightPreset);
  lightPresetRef.current = lightPreset;

  const indexes = useMemo(
    () => buildDriverIndexes(locationData, sessionStartMs),
    [locationData, sessionStartMs],
  );
  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Pit rejoin and window for the focused car (shared with the 2D map).
  const pitWindowTrack = useMemo(() => {
    if (!circuitGeom || circuitGeom.x.length < 2) return null;
    const points = circuitGeom.x.map((x, i) => ({ x, y: circuitGeom.y[i]! }));
    return {
      geom: buildTrackGeometry({ points, bounds: computeTrackBounds(points) }),
      points,
      toScale: true,
    };
  }, [circuitGeom]);
  const pitPlacement = useMemo(() => {
    if (!pitWindowTrack) return null;
    const pitLane = getPitLane(circuitKey);
    if (!pitLane) return null;
    return {
      geom: pitWindowTrack.geom,
      model: buildRingModel({
        geom: pitWindowTrack.geom,
        circuitGeom: null,
        pitLane,
        totalMarshalPosts: 0,
        toScale: true,
      }),
      hints: new Map<number, number>(),
    };
  }, [pitWindowTrack, circuitKey]);
  useEffect(() => {
    pitPlacement?.hints.clear();
  }, [pitPlacement, sessionKey]);
  const pitRejoin = usePitWindow({
    track: pitWindowTrack,
    circuitGeom,
    circuitKey,
    indexes,
    focusDriver,
    t,
    gaps: pitRejoinGaps,
    leaderNumber,
    trackVehicles: activeTrackVehicles,
    excluded: retiredDrivers,
  });
  const pitWindowDrivers = pitRejoin?.highlight;

  // ── Telemetry overlays (same data and builders as the 2D map) ─────────────
  const arc = useMemo(
    () => (circuitGeom && geo ? buildArcPolyline(circuitGeom, geo) : null),
    [circuitGeom, geo],
  );
  // Driver heatmap (setting shared with 2D): off skips the lap's car data.
  const heatDriver = showHeatmap ? focusDriver : null;
  const heatData = useCarDataForLap(
    sessionKey, heatDriver, focusDriverLap ?? null,
    { enabled: telemetryEnabled },
  );
  const referenceHeatData = useCarDataForLap(
    sessionKey,
    heatDriver,
    focusDriverLap != null && focusDriverLap > 1 ? focusDriverLap - 1 : null,
    { enabled: telemetryEnabled },
  );
  const showElevation = showEnhancedVisuals && mapShowElevation;
  const overlayGradients = useMemo(() => {
    if (!arc) return { heat: null, delta: null, elevation: null };
    return {
      heat: gradientFromSegments(arc, heatColors(buildHeatSegments(arc, heatData.data))),
      delta: showEnhancedVisuals
        ? gradientFromSegments(
            arc,
            buildDeltaSegments(arc, heatData.data, referenceHeatData.data),
          )
        : null,
      elevation: showElevation
        ? gradientFromSegments(
            arc,
            buildElevationSegments(
              arc,
              locationData,
              focusDriver ?? drivers[0]?.driver_number ?? null,
              lightMode,
            ),
          )
        : null,
    };
  }, [
    arc,
    heatData.data,
    referenceHeatData.data,
    showEnhancedVisuals,
    showElevation,
    locationData,
    focusDriver,
    drivers,
    lightMode,
  ]);
  const hotspots = useMemo(
    () =>
      buildHotspotPoints(
        showEnhancedVisuals ? buildBrakingHotspots(arc, heatData.data) : [],
      ),
    [arc, heatData.data, showEnhancedVisuals],
  );

  const trackLine = useMemo(
    () => (circuitGeom && geo ? buildTrackLine(circuitGeom, geo) : null),
    [circuitGeom, geo],
  );
  const bounds = useMemo(() => (trackLine ? trackBounds(trackLine) : null), [trackLine]);
  const overviewBearing = useMemo(
    () => (geo ? broadcastBearing(circuitGeom ?? null, geo) : 0),
    [circuitGeom, geo],
  );
  const miniMap = useMemo(() => {
    if (!circuitGeom) return null;
    const compact = window.matchMedia?.("(max-width: 767px)").matches ?? false;
    return buildMiniMapProjection(
      circuitGeom,
      compact ? MINIMAP_SIZE_COMPACT : MINIMAP_SIZE,
      MINIMAP_PAD,
    );
  }, [circuitGeom]);

  // Inputs the RAF loop reads each frame. Synced after commit; `dirty` forces a
  // car redraw even when the playhead is paused.
  const pulseSet = useMemo(() => new Set(pulseDrivers ?? []), [pulseDrivers]);
  const carInput: CarFeatureInput = {
    indexes,
    driverByNumber,
    focusDriver,
    battlingDrivers,
    pitWindowDrivers,
    retiredDrivers,
    pulseDrivers: pulseSet,
    activeCompounds,
    safetyCarSirenOn,
    showAcronym: mapShowDriverAcronym,
    showNumberInside: mapShowDriverNumberInside,
    lightMode,
    pitPlacement,
  };
  const liveRef = useRef<CarFeatureInput & { dirty: boolean }>({
    ...carInput,
    dirty: true,
  });
  useEffect(() => {
    liveRef.current = { ...carInput, dirty: true };
    // carInput is rebuilt every render; sync only when one of its parts changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    indexes,
    driverByNumber,
    focusDriver,
    battlingDrivers,
    pitWindowDrivers,
    retiredDrivers,
    pulseSet,
    activeCompounds,
    safetyCarSirenOn,
    mapShowDriverAcronym,
    mapShowDriverNumberInside,
    lightMode,
    pitPlacement,
    sessionKey,
  ]);
  // Focused car's trail colouring for the RAF loop: speed lookup (null = team
  // colour only) and the team colour for samples without car data.
  const trailStyleRef = useRef<{ speedAt: ((t: number) => number | null) | null; color: string }>({
    speedAt: null,
    color: "#ffffff",
  });

  // Battle gap ribbons for the RAF loop: the battles to draw (empty = none)
  // and the centerline in local metres to draw them along.
  const gapRibbonsRef = useRef<{ gaps: readonly BattleGap[]; center: Array<{ x: number; y: number }> }>({
    gaps: [],
    center: [],
  });
  const gapCenter = useMemo(
    () => (circuitGeom && geo ? circuitGeom.x.map((x, i) => f1ToEnu(geo, x, circuitGeom.y[i]!)) : []),
    [circuitGeom, geo],
  );
  useEffect(() => {
    gapRibbonsRef.current = {
      gaps: battleGapsEnabled && battleGaps ? battleGaps : [],
      center: gapCenter,
    };
  }, [battleGapsEnabled, battleGaps, gapCenter]);

  // Pixels per 2D SVG unit for this panel, so cars match the 2D map's size.
  const carScaleRef = useRef(1);
  // Car icon images already added to the map (see ensureCarIcons).
  const carIconsRef = useRef(new Set<string>());

  /** Re-derive the car scale from the panel size and follow state. */
  const syncCarScale = useCallback(
    (map: mapboxgl.Map, following: boolean, force = false) => {
      const container = containerRef.current;
      if (!container) return;
      const next = carScaleFor(container.clientWidth, container.clientHeight, following);
      if (!force && Math.abs(next - carScaleRef.current) < 0.01) return;
      carScaleRef.current = next;
      clearCarIcons(map, carIconsRef.current);
      liveRef.current.dirty = true;
      if (map.getLayer(CAR_DOT_LAYER)) applyCarLayers(map, next);
    },
    [],
  );

  const onSelectRef = useRef(onSelectDriver);
  useEffect(() => {
    onSelectRef.current = onSelectDriver;
  }, [onSelectDriver]);

  // Follow-camera state, owned by the RAF loop.
  const followRef = useRef({ suspended: false, approaching: true });
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialCameraMode);
  const onCameraModeChangeRef = useRef(onCameraModeChange);
  onCameraModeChangeRef.current = onCameraModeChange;
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const cameraModes = director ? CAMERA_MODES_WITH_TV : CAMERA_MODES;
  // TV camera: the director's pick, read by the RAF loop. `directorCut` makes
  // the next frame jump straight to the new car (a broadcast cut, not a pan).
  const directorRef = useRef<DirectorState>(INITIAL_DIRECTOR_STATE);
  const directorCutRef = useRef(false);
  // Black veil over the map that each director cut flashes and fades out, so
  // cuts read like a broadcast's. Driven on the DOM node: no re-renders.
  const cutFadeRef = useRef<HTMLDivElement>(null);
  const flashCut = useCallback(() => {
    const el = cutFadeRef.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.style.transition = "none";
    el.style.opacity = "1";
    void el.offsetWidth; // commit the black frame before fading out
    el.style.transition = `opacity ${MAP3D_DIRECTOR_FADE_MS}ms ease-out`;
    el.style.opacity = "0";
  }, []);
  const [directorShot, setDirectorShot] = useState<DirectorShot | null>(null);
  // The plain "follow" camera only tracks the focused car once the user opts
  // in (toolbar toggle, remembered); chase, onboard and orbit are explicit.
  const followFocusedRef = useRef(followFocused);
  /** Whether the camera tracks a car (focused, or the TV director's pick). */
  const followingRef = useRef(
    () =>
      cameraModeRef.current === "tv" ||
      (liveRef.current.focusDriver != null &&
        (cameraModeRef.current !== "follow" || followFocusedRef.current)),
  );
  // Following state last applied to the camera, so turning it off zooms out.
  const wasFollowingRef = useRef(false);
  // Chase camera smoothing state (local metres), reset on mode/focus change.
  const chaseRef = useRef<{ eye: { x: number; y: number } | null; heading: number | null }>({
    eye: null,
    heading: null,
  });

  // ── Map lifecycle: one map per circuit ────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !geo || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container,
      style: MAP3D_STYLE_URL,
      config: {
        basemap: {
          lightPreset: lightPresetRef.current,
          ...BASEMAP_CONFIG,
          show3dObjects: useSettings.getState().mapView3dBuildings,
          ...(window.matchMedia?.("(max-width: 767px)").matches ? COMPACT_BASEMAP_CONFIG : {}),
        },
      },
      center: [geo.originLng, geo.originLat],
      zoom: 14,
      pitch: MAP3D_OVERVIEW_PITCH,
      antialias: true,
      // Replaced below by the compact control.
      attributionControl: false,
    });
    // Mapbox's terms and OpenStreetMap's licence require visible attribution;
    // the compact control keeps it to an ⓘ button that expands on click.
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    // Each Map instance is a billed Mapbox map load.
    trackEvent("trackmap3d_map_load", { circuit_key: circuitKeyRef.current ?? -1 });

    map.on("style.load", () => {
      // CC0 car model by Kenney (public/models/LICENSE-kenney-car-kit.txt).
      map.addModel(
        CAR_MODEL_ID,
        new URL(`${import.meta.env.BASE_URL}models/f1-car.glb`, window.location.href).href,
      );
      // Published only now: on a circuit change, effects in the same commit
      // still see the old `styleReady`, and would edit an unloaded style
      // ("Style is not done loading") if they could reach this map.
      mapRef.current = map;
      setStyleReady(true);
    });

    // Any hand-driven camera move pauses the follow camera until "recenter".
    const suspendFollow = (e: object) => {
      const byUser = "originalEvent" in e && e.originalEvent != null;
      if (!byUser || !followingRef.current()) return;
      followRef.current.suspended = true;
      setFollowSuspended(true);
    };
    map.on("dragstart", suspendFollow);
    map.on("rotatestart", suspendFollow);
    map.on("pitchstart", suspendFollow);

    syncCarScale(map, followingRef.current(), true);
    map.on("resize", () => syncCarScale(map, followingRef.current()));

    map.on("click", CAR_DOT_LAYER, (e) => {
      const num = Number(e.features?.[0]?.properties?.num);
      if (Number.isFinite(num)) onSelectRef.current?.(num);
    });
    map.on("mouseenter", CAR_DOT_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CAR_DOT_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    // Mapbox can keep a canvas size measured mid-layout (tabs, panels settling)
    // and miss the later change; resize whenever the container does.
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.resize());
    resizeObserver?.observe(container);

    const icons = carIconsRef.current;
    return () => {
      resizeObserver?.disconnect();
      icons.clear();
      map.remove();
      mapRef.current = null;
      setStyleReady(false);
    };
  }, [geo, token, syncCarScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    map.setConfigProperty("basemap", "lightPreset", lightPreset);
    if (map.getLayer(LAYER_TRACK_SURFACE)) {
      map.setPaintProperty(LAYER_TRACK_SURFACE, "line-color", ribbonColorFor(lightPreset));
    }
    applyTrackPalette(map, lightPreset, wetTrack, getRunoffStyle(circuitKey).surface);
    applyTracksidePalette(map, lightPreset);
  }, [lightPreset, wetTrack, styleReady, circuitGeom, circuitKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    // Compound badge outlines and safety car text follow the theme.
    clearCarIcons(map, carIconsRef.current);
    liveRef.current.dirty = true;
  }, [lightMode, styleReady]);

  // Terrain is opt-in: the DEM is ~10 m per cell, so at street zoom buildings
  // and the draped track wobble over it. Off means no DEM tiles are fetched.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!terrainEnabled) {
      map.setTerrain(null);
      return;
    }
    if (!map.getSource(SRC_DEM)) {
      map.addSource(SRC_DEM, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
    }
    map.setTerrain({ source: SRC_DEM, exaggeration: MAP3D_TERRAIN_EXAGGERATION });
  }, [terrainEnabled, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    map.setConfigProperty("basemap", "show3dObjects", buildingsEnabled);
  }, [buildingsEnabled, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setTracksideVisibility(map, tracksideEnabled);
  }, [tracksideEnabled, styleReady, circuitGeom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.getLayer(CAR_DOT_LAYER)) return;
    applyCarLayers(map, carScaleRef.current);
  }, [carModelsEnabled, styleReady]);

  const rain = rainFor(weatherEffectsEnabled ? (weather ?? weatherOverlay) : null);
  const rainKey = rain ? `${rain.density.toFixed(2)}|${rain.intensity.toFixed(2)}` : "dry";
  // The style's own fog, saved the first time rain haze replaces it.
  const styleFogRef = useRef<{ saved: boolean; fog: mapboxgl.FogSpecification | null }>({
    saved: false,
    fog: null,
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    map.setRain(rain ? { density: rain.density, intensity: rain.intensity } : null);
    const haze = rainFogFor(lightPreset, rain);
    const saved = styleFogRef.current;
    if (haze) {
      if (!saved.saved) styleFogRef.current = { saved: true, fog: map.getFog() ?? null };
      map.setFog(haze);
    } else if (saved.saved) {
      map.setFog(saved.fog);
      styleFogRef.current = { saved: false, fog: null };
    }
    // rainKey captures `rain`; the object itself is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainKey, lightPreset, styleReady]);

  // ── Static circuit layers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !circuitGeom || !geo || !trackLine) return;
    const lat = geo.originLat;

    let sectorZones: ReturnType<typeof buildSectorZones> | null = null;
    if (!map.getSource(SRC_TRACK)) {
      map.addSource(SRC_TRACK, { type: "geojson", data: trackLine });
      map.addSource(SRC_MARSHAL, {
        type: "geojson",
        data: buildMarshalSectorLines(circuitGeom, geo),
      });
      map.addSource(SRC_CORNERS, {
        type: "geojson",
        data: buildCornerPoints(circuitGeom, geo),
      });
      map.addSource(CAR_SOURCE, { type: "geojson", data: emptyCollection() });

      map.addLayer({
        id: LAYER_TRACK_SURFACE,
        type: "line",
        source: SRC_TRACK,
        slot: "middle",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-emissive-strength": 1,
          "line-color": ribbonColorFor(lightPresetRef.current),
          // Line track for zoomed-out views; real-width surface takes over.
          "line-opacity": fadeOut(0.9),
          "line-width": groundWidthExpression(MAP3D_TRACK_WIDTH_M, lat, 3),
        },
      });
      map.addLayer({
        id: "map3d-flags",
        type: "line",
        source: SRC_MARSHAL,
        slot: "middle",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-emissive-strength": 1,
          "line-color": ["coalesce", ["feature-state", "color"], "#000000"],
          // Zoomed out the flag is a glow along the track; closer in, the
          // asphalt polygons below take over.
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            MAP3D_SURFACE_MIN_ZOOM - 0.5,
            ["case", ["boolean", ["feature-state", "active"], false], 0.8, 0],
            MAP3D_SURFACE_MIN_ZOOM,
            0,
          ],
          "line-blur": 2,
          "line-width": groundWidthExpression(MAP3D_FLAG_WIDTH_M, lat, 6),
        },
      });
      const pitLane = getPitLane(circuitKey);
      if (pitLane) {
        const pitLine = buildPitLaneLine(pitLane, geo);
        map.addSource(SRC_PIT_LANE, {
          type: "geojson",
          data: pitLine,
        });
        const coordinates = pitLine.geometry.coordinates;
        if (coordinates.length >= 2) {
          map.addSource("map3d-pit-access", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: (["entry", "exit"] as const).map((part, index) => ({
                type: "Feature",
                properties: { part },
                geometry: { type: "Point", coordinates: coordinates[index === 0 ? 0 : coordinates.length - 1]! },
              })),
            },
          });
          map.addLayer({
            id: "map3d-pit-access",
            type: "circle",
            source: "map3d-pit-access",
            slot: "middle",
            filter: ["in", ["get", "part"], ["literal", []]],
            paint: {
              "circle-radius": TRACK_PIT_ACCESS_MARKER_RADIUS,
              "circle-color": TOKEN_HEX.red,
              "circle-stroke-width": 1,
              "circle-stroke-color": TOKEN_HEX.fg,
            },
          });
        }
        map.addLayer({
          id: "map3d-pit-lane",
          type: "line",
          source: SRC_PIT_LANE,
          slot: "middle",
          layout: { "line-join": "round", "line-cap": "butt" },
          paint: {
            "line-emissive-strength": 1,
            "line-color": "#e9ecf3",
            "line-opacity": fadeOut(0.6),
            "line-width": 1.5,
            "line-dasharray": [3, 2],
          },
        });
      }

      // Real-width asphalt, verge, pit lane, kerbs and start grid, under the
      // flag band and telemetry overlays.
      const runoffSurface = getRunoffStyle(circuitKey).surface;
      addTrackSurfaceLayers(
        map,
        buildTrackSurface(circuitGeom, geo, pitLane),
        lightPresetRef.current,
        "map3d-flags",
        runoffSurface,
      );
      if (wetTrackRef.current) applyTrackPalette(map, lightPresetRef.current, true, runoffSurface);
      // Barriers, fences, pit wall and start gantry.
      addTracksideLayers(
        map,
        buildTrackside(circuitGeom, geo, pitLane),
        lightPresetRef.current,
        useSettings.getState().mapView3dTrackside,
        "map3d-flags",
      );
      // The 2D map's sector flag colours: condition ribbon + sector paint.
      sectorZones = buildSectorZones(circuitGeom, geo);
      // Flags painted onto the asphalt, one polygon per marshal post.
      map.addSource(SRC_FLAG_ZONES, { type: "geojson", data: buildFlagZones(circuitGeom, geo) });
      map.addLayer(
        {
          id: "map3d-flag-zones",
          type: "fill",
          source: SRC_FLAG_ZONES,
          slot: "middle",
          minzoom: MAP3D_SURFACE_MIN_ZOOM - 0.5,
          paint: {
            "fill-emissive-strength": 0.8,
            "fill-color": ["coalesce", ["feature-state", "color"], "#000000"],
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              MAP3D_SURFACE_MIN_ZOOM - 0.5,
              0,
              MAP3D_SURFACE_MIN_ZOOM,
              ["case", ["boolean", ["feature-state", "active"], false], 0.55, 0],
            ],
          },
        },
        "map3d-flags",
      );
      addSectorLayers(map, sectorZones, lat, {
        ribbonBefore: "map3d-surface-track",
        ribbonLineBefore: LAYER_TRACK_SURFACE,
        paintBefore: "map3d-flag-zones",
      });
      map.addLayer({
        id: "map3d-track-line",
        type: "line",
        source: SRC_TRACK,
        slot: "middle",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-emissive-strength": 1,
          "line-color": "#ffffff",
          "line-opacity": fadeOut(0.85),
          "line-width": 2,
        },
      });
      map.addLayer({
        id: LAYER_CORNERS,
        type: "symbol",
        source: SRC_CORNERS,
        slot: "top",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-allow-overlap": true,
          visibility: "none",
        },
        paint: {
          "text-emissive-strength": 1,
          "text-occlusion-opacity": 1,
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      });
      applyCarLayers(map, carScaleRef.current);
      if (arc) {
        const container = containerRef.current;
        addOverlayLayers(map, {
          geom: circuitGeom,
          geo,
          arc,
          sectorBoundaries: sectorZones?.boundaries,
          lightMode: useSettings.getState().lightMode,
          scale: carScaleFor(container?.clientWidth ?? 0, container?.clientHeight ?? 0),
          segmentsBefore: "map3d-flags",
          markupBefore: "map3d-car-pulse",
        });
      }
    }

    if (bounds) {
      map.fitBounds(bounds, {
        bearing: overviewBearing,
        pitch: MAP3D_OVERVIEW_PITCH,
        padding: FIT_PADDING,
        duration: 0,
      });
    }
    liveRef.current.dirty = true;
    // Layers are built once per map; the camera only fits on first build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleReady, circuitGeom, geo, trackLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.getLayer(LAYER_CORNERS)) return;
    map.setLayoutProperty(
      LAYER_CORNERS,
      "visibility",
      mapShowCornerNumbers ? "visible" : "none",
    );
  }, [mapShowCornerNumbers, styleReady, circuitGeom]);

  // ── Marshal-post flags ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !circuitGeom || !map.getSource(SRC_MARSHAL)) return;
    const painted = flagColorsEnabled ? trackFlagState : null;
    for (const ms of circuitGeom.marshalSectors) {
      const color = marshalSegmentColor(painted, ms.number);
      const state = { active: color !== null, color: color ?? "#000000" };
      map.setFeatureState({ source: SRC_MARSHAL, id: ms.number }, state);
      if (map.getSource(SRC_FLAG_ZONES)) {
        map.setFeatureState({ source: SRC_FLAG_ZONES, id: ms.number }, state);
      }
    }
  }, [trackFlagState, flagColorsEnabled, styleReady, circuitGeom]);

  const pitLaneAccess = pitLaneStatus?.lane;
  const pitEntryAccess = pitLaneStatus?.entry;
  const pitExitAccess = pitLaneStatus?.exit;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.getLayer("map3d-pit-lane")) return;
    const color = pitLaneAccess === "closed"
      ? TOKEN_HEX.red
      : pitLaneAccess === "open" ? TOKEN_HEX.green : "#e9ecf3";
    map.setPaintProperty("map3d-pit-lane", "line-color", color);
    if (map.getLayer("map3d-surface-pit-lane-lines")) {
      map.setPaintProperty("map3d-surface-pit-lane-lines", "fill-color",
        !pitLaneAccess || pitLaneAccess === "unknown" ? MAP3D_EDGE_LINE_COLOR : color);
    }
    if (map.getLayer("map3d-pit-access")) {
      const parts = [
        ...(pitEntryAccess && pitEntryAccess !== "unknown" ? ["entry"] : []),
        ...(pitExitAccess && pitExitAccess !== "unknown" ? ["exit"] : []),
      ];
      map.setFilter("map3d-pit-access", ["in", ["get", "part"], ["literal", parts]]);
      map.setPaintProperty("map3d-pit-access", "circle-color", [
        "match", ["get", "part"],
        "entry", pitEntryAccess === "open" ? TOKEN_HEX.green : TOKEN_HEX.red,
        "exit", pitExitAccess === "open" ? TOKEN_HEX.green : TOKEN_HEX.red,
        TOKEN_HEX.red,
      ]);
    }
  }, [pitLaneAccess, pitEntryAccess, pitExitAccess, styleReady, circuitGeom, lightPreset, wetTrack]);

  // ── Overlay data + visibility ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setOverlayGradients(map, overlayGradients);
    (map.getSource(SRC_HOTSPOTS) as mapboxgl.GeoJSONSource | undefined)?.setData(hotspots);
  }, [overlayGradients, hotspots, styleReady, arc]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setOverlayVisibility(map, { enhanced: showEnhancedVisuals });
    setSectorRibbonVisibility(map, sectorRibbonEnabled);
  }, [showEnhancedVisuals, sectorRibbonEnabled, styleReady, arc]);

  // ── Camera: overview when nothing is focused ──────────────────────────────
  const fitOverview = useCallback(
    (duration: number) => {
      const map = mapRef.current;
      if (!map || !bounds) return;
      map.fitBounds(bounds, {
        bearing: overviewBearing,
        pitch: MAP3D_OVERVIEW_PITCH,
        padding: FIT_PADDING,
        duration,
      });
    },
    [bounds, overviewBearing],
  );

  useEffect(() => {
    followRef.current = { suspended: false, approaching: true };
    chaseRef.current = { eye: null, heading: null };
    setFollowSuspended(false);
    // Markers grow while following, as the 2D follow camera's zoom does.
    // Picking a car ends the director; the follow camera then tracks it only
    // with following switched on.
    if (focusDriver != null && cameraModeRef.current === "tv") {
      cameraModeRef.current = "follow";
      setCameraMode("follow");
      onCameraModeChangeRef.current?.("follow");
    }
    if (mapRef.current) syncCarScale(mapRef.current, followingRef.current());
    // Back to the overview when the camera stops tracking a car; picking a car
    // without following keeps the user's view.
    const following = followingRef.current();
    if (!following && wasFollowingRef.current && styleReady) fitOverview(1200);
    wasFollowingRef.current = following;
    // Re-run only on focus changes, not when the overview callback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDriver]);

  // Follow toggle (shared with the 2D map's setting).
  useEffect(() => {
    if (followFocusedRef.current === followFocused) return;
    followFocusedRef.current = followFocused;
    followRef.current = { suspended: false, approaching: true };
    setFollowSuspended(false);
    const following = followingRef.current();
    if (mapRef.current) syncCarScale(mapRef.current, following);
    if (!following && wasFollowingRef.current && styleReady) fitOverview(800);
    wasFollowingRef.current = following;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followFocused]);

  // ── Per-frame loop: car markers + follow camera ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !geo) return;
    let raf = 0;
    let lastTrailUpdate = -Infinity;
    let gapRibbonsShown = false;
    let lastFrame = performance.now();
    let lastT = Number.NaN;

    const probe = map3dDebugEnabled()
      ? createFrameProbe(2000, (s) =>
          console.info(
            `[map3d] ${s.frames} frames · work avg ${s.avgMs.toFixed(2)} ms · max ${s.maxMs.toFixed(2)} ms (budget ${MAP3D_FRAME_BUDGET_MS} ms)`,
          ),
        )
      : null;

    // A tile of the car source finished loading: the update in flight is on
    // screen. Under ?debug=map3d, log the car update rate and latency.
    const carSync = createCarSync();
    let carStats = { updates: 0, latencyMs: 0, since: performance.now() };
    const onCarData = (e: mapboxgl.MapSourceDataEvent) => {
      if (e.sourceId !== CAR_SOURCE || !e.tile || !e.isSourceLoaded) return;
      const now = performance.now();
      const latency = markCarsShown(carSync, now);
      if (latency === null || !probe) return;
      carStats.updates += 1;
      carStats.latencyMs += latency;
      if (now - carStats.since >= 2000) {
        console.info(
          `[map3d] cars ${((carStats.updates * 1000) / (now - carStats.since)).toFixed(1)} updates/s · latency avg ${(carStats.latencyMs / carStats.updates).toFixed(1)} ms`,
        );
        carStats = { updates: 0, latencyMs: 0, since: now };
      }
    };

    const step = (now: number) => {
      const { t: timelinePlayhead } = useTimeline.getState();
      const playhead = previewTimeMs ?? timelinePlayhead;
      const live = liveRef.current;

      if ((playhead !== lastT || live.dirty) && canSendCars(carSync, now)) {
        const source = map.getSource(CAR_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (source) {
          const cars = buildCarFeatures(geo, playhead, live);
          ensureCarIcons(map, cars, carScaleRef.current, live.lightMode, carIconsRef.current);
          source.setData(cars);
          markCarsSent(carSync, playhead, now);
          lastT = playhead;
          live.dirty = false;
        }
      }

      // Focused car's trail, refreshed at ~10 Hz.
      if (now - lastTrailUpdate >= 100) {
        lastTrailUpdate = now;
        const trailSource = map.getSource(SRC_TRAIL) as mapboxgl.GeoJSONSource | undefined;
        const idx = live.focusDriver != null ? live.indexes.get(live.focusDriver) : undefined;
        const path = idx
          ? buildTrailPath(idx, playhead, geo, MAP3D_TRAIL_MS, MAP3D_TRAIL_STEP_MS)
          : null;
        trailSource?.setData({
          type: "FeatureCollection",
          features: path ? [trailFeature(path)] : [],
        });
        // Speed colours move with the car, so the gradient follows each refresh.
        const { speedAt, color } = trailStyleRef.current;
        if (path && speedAt && map.getLayer(LAYER_TRAIL)) {
          map.setPaintProperty(LAYER_TRAIL, "line-gradient", trailSpeedGradient(path, speedAt, color));
        }

        // Battle gap ribbons move with the cars, so they refresh with the trail.
        const { gaps, center } = gapRibbonsRef.current;
        if (gaps.length > 0 || gapRibbonsShown) {
          const carAt = (driver: number) => {
            const i = live.indexes.get(driver);
            const p = i ? interpolateXY(i, playhead) : null;
            return p && !isOffTrackPlaceholder(p) ? f1ToEnu(geo, p.x, p.y) : null;
          };
          const ribbons = buildGapRibbons(gaps, carAt, center, geo, MAP3D_GAP_RIBBON_MAX_M, live.focusDriver);
          (map.getSource(SRC_GAP_RIBBONS) as mapboxgl.GeoJSONSource | undefined)?.setData(ribbons.lines);
          (map.getSource(SRC_GAP_LABELS) as mapboxgl.GeoJSONSource | undefined)?.setData(ribbons.labels);
          gapRibbonsShown = gaps.length > 0;
        }
      }

      // Pulse / siren rings animate like the 2D SVG <animate> rings.
      if (live.pulseDrivers?.size || live.safetyCarSirenOn) {
        const style = map as unknown as StyleSetters;
        for (const [layer, key, value] of animatedCarPaint(carScaleRef.current, now)) {
          style.setPaintProperty(layer, key, value);
        }
      }

      const follow = followRef.current;
      // TV mode follows the director's car with the camera that suits the shot.
      const shot = cameraModeRef.current === "tv" ? directorRef.current.shot : null;
      const mode =
        cameraModeRef.current === "tv"
          ? shot
            ? cameraForShot(shot.kind)
            : "follow"
          : cameraModeRef.current;
      const target = shot?.driver ?? (followingRef.current() ? live.focusDriver : null);
      // Raw frame time drives the smoothing (slow frames catch up more); the
      // orbit uses a capped one so a stall doesn't spin the map.
      const frameMs = now - lastFrame;
      const dt = Math.min(100, frameMs);
      lastFrame = now;
      if (follow.suspended) return;

      if (target == null) {
        // Nothing to follow: orbit circles the overview, other modes hold still.
        if (mode === "orbit") map.jumpTo({ bearing: orbitBearing(map.getBearing(), dt) });
        return;
      }
      const idx = live.indexes.get(target);
      if (!idx) return;
      // Aim at the instant the cars on screen show, not the live playhead or
      // the last update sent: car updates take a couple of worker round trips
      // to land, and a camera ahead of them makes the followed car shake (at
      // 16× the chase camera would even pass it).
      const camT = cameraTime(carSync, playhead);
      const pos = interpolateXY(idx, camT);
      if (!pos || isOffTrackPlaceholder(pos)) return;
      const onboard = mode === "onboard";
      // Onboard looks into the corner: heading over a window centred on camT
      // (the location index clamps at its end, so live data still works).
      const prev = interpolateXY(
        idx,
        camT - (onboard ? MAP3D_ONBOARD_HEADING_MS : MAP3D_HEADING_LOOKBACK_MS),
      );
      const next = onboard ? interpolateXY(idx, camT + MAP3D_ONBOARD_HEADING_MS) : pos;
      const [lng, lat] = f1ToLngLat(geo, pos.x, pos.y);
      const heading = prev && next ? headingDeg(geo, prev, next) : null;
      const cutNow = directorCutRef.current;
      directorCutRef.current = false;

      if (mode === "chase" || onboard) {
        const chase = chaseRef.current;
        chase.heading =
          heading === null
            ? chase.heading
            : chase.heading === null
              ? heading
              : lerpAngleDeg(
                  chase.heading,
                  heading,
                  frameAlpha(
                    onboard ? MAP3D_ONBOARD_ALPHA : MAP3D_FOLLOW_BEARING_ALPHA * 2,
                    frameMs,
                  ),
                );
        if (chase.heading === null) return;
        const carEnu = f1ToEnu(geo, pos.x, pos.y);
        const pose = onboard
          ? onboardPose(carEnu, chase.heading)
          : chasePose(carEnu, chase.heading);
        const eyeAlpha = frameAlpha(onboard ? MAP3D_ONBOARD_ALPHA : MAP3D_CHASE_ALPHA, frameMs);
        chase.eye = chase.eye
          ? {
              x: chase.eye.x + (pose.eye.x - chase.eye.x) * eyeAlpha,
              y: chase.eye.y + (pose.eye.y - chase.eye.y) * eyeAlpha,
            }
          : pose.eye;
        const eye = enuToLngLat(geo.originLng, geo.originLat, chase.eye.x, chase.eye.y);
        const target = enuToLngLat(geo.originLng, geo.originLat, pose.target.x, pose.target.y);
        const carGround = map.queryTerrainElevation([lng, lat]) ?? 0;
        const eyeGround = map.queryTerrainElevation(eye) ?? 0;
        const cam = map.getFreeCameraOptions();
        cam.position = mapboxgl.MercatorCoordinate.fromLngLat(
          eye,
          Math.max(carGround, eyeGround) + pose.up,
        );
        cam.lookAtPoint(target, undefined, carGround);
        map.setFreeCameraOptions(cam);
        return;
      }

      if (cutNow) {
        map.jumpTo({
          center: [lng, lat],
          bearing: heading ?? map.getBearing(),
          zoom: MAP3D_FOLLOW_ZOOM,
          pitch: MAP3D_FOLLOW_PITCH,
        });
        follow.approaching = false;
        return;
      }
      const center = map.getCenter();
      const bearing = map.getBearing();
      const centerAlpha = frameAlpha(MAP3D_FOLLOW_CENTER_ALPHA, frameMs);
      const camera: mapboxgl.CameraOptions = {
        center: [
          center.lng + (lng - center.lng) * centerAlpha,
          center.lat + (lat - center.lat) * centerAlpha,
        ],
        bearing:
          mode === "orbit"
            ? orbitBearing(bearing, dt)
            : heading === null
              ? bearing
              : lerpAngleDeg(
                  bearing,
                  heading,
                  frameAlpha(MAP3D_FOLLOW_BEARING_ALPHA, frameMs),
                ),
      };
      // Ease zoom/pitch in when follow starts, then leave them to the user.
      if (follow.approaching) {
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const approach = frameAlpha(0.08, frameMs);
        camera.zoom = zoom + (MAP3D_FOLLOW_ZOOM - zoom) * approach;
        camera.pitch = pitch + (MAP3D_FOLLOW_PITCH - pitch) * approach;
        if (
          Math.abs(MAP3D_FOLLOW_ZOOM - zoom) < 0.02 &&
          Math.abs(MAP3D_FOLLOW_PITCH - pitch) < 0.5
        ) {
          follow.approaching = false;
        }
      }
      map.jumpTo(camera);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!probe) return step(now);
      const start = performance.now();
      step(now);
      probe(performance.now() - start);
    };
    raf = requestAnimationFrame(frame);
    map.on("sourcedata", onCarData);
    return () => {
      cancelAnimationFrame(raf);
      map.off("sourcedata", onCarData);
    };
  }, [styleReady, geo, previewTimeMs]);

  const recenter = useCallback(() => {
    trackEvent("trackmap3d_recenter");
    followRef.current = { suspended: false, approaching: true };
    setFollowSuspended(false);
    if (!followingRef.current()) fitOverview(800);
  }, [fitOverview]);

  // Follow camera with a focused car: off → follow, following but dragged
  // away → resume, following → stop (back to the overview).
  const toggleFollow = useCallback(() => {
    if (followFocused && followSuspended) {
      recenter();
      return;
    }
    trackEvent("trackmap_follow_toggled", { following: !followFocused, view: "3d" });
    setSetting("mapFollowFocusedCar", !followFocused);
  }, [followFocused, followSuspended, recenter, setSetting]);
  const toggleHeatmap = useCallback(() => {
    trackEvent("trackmap_heatmap_toggled", { shown: !showHeatmap, view: "3d" });
    setSetting("mapShowDriverHeatmap", !showHeatmap);
  }, [showHeatmap, setSetting]);
  const heatmapTitle = showHeatmap ? "Hide the driver heatmap" : "Show the driver heatmap";
  const followToggle = focusDriver != null && cameraMode === "follow";
  const followTitle = !followToggle
    ? focusDriver != null
      ? "Recentre on the focused car"
      : "Fit track"
    : !followFocused
      ? "Follow the focused car"
      : followSuspended
        ? "Resume following the focused car"
        : "Stop following the focused car";

  const applyCameraMode = useCallback(
    (next: CameraMode) => {
      const wasFollowing = followingRef.current();
      cameraModeRef.current = next;
      followRef.current = { suspended: false, approaching: true };
      chaseRef.current = { eye: null, heading: null };
      directorRef.current = INITIAL_DIRECTOR_STATE;
      directorCutRef.current = next === "tv";
      setDirectorShot(null);
      setFollowSuspended(false);
      setCameraMode(next);
      onCameraModeChangeRef.current?.(next);
      const map = mapRef.current;
      if (!map) return;
      syncCarScale(map, followingRef.current());
      if (wasFollowing && !followingRef.current()) fitOverview(800);
      wasFollowingRef.current = followingRef.current();
    },
    [syncCarScale, fitOverview],
  );

  const cycleCameraMode = useCallback(() => {
    const next = nextCameraMode(cameraModeRef.current, cameraModes);
    trackEvent("trackmap3d_camera_mode_changed", { mode: next });
    applyCameraMode(next);
  }, [applyCameraMode, cameraModes]);

  // Director: re-pick at the coarse playhead; the RAF loop reads the result.
  useEffect(() => {
    if (cameraMode !== "tv") return;
    if (!director) {
      // No data (yet, or a non-race session): TV follows the focused car.
      if (directorRef.current.shot) setDirectorShot(null);
      directorRef.current = INITIAL_DIRECTOR_STATE;
      return;
    }
    const positions = positionsAt(director.positions, sessionStartMs + t);
    let leader: number | null = null;
    for (const [driver, position] of positions) if (position === 1) leader = driver;
    const prev = directorRef.current;
    const next = pickShot(
      director.cues,
      {
        t,
        battles: battlePairs(positions, director.battling, retiredDrivers),
        leader,
        excluded: retiredDrivers,
      },
      prev,
      performance.now(),
    );
    directorRef.current = next;
    if (sameShot(prev.shot, next.shot)) return;
    // A new shot is a hard cut, unless the viewer has taken the camera.
    chaseRef.current = { eye: null, heading: null };
    directorCutRef.current = true;
    setDirectorShot(next.shot);
    if (next.shot) {
      // The RAF loop makes the cut on its next frame, under the black veil.
      flashCut();
      trackEvent("trackmap3d_director_cut", { kind: next.shot.kind });
    }
  }, [cameraMode, director, t, sessionStartMs, retiredDrivers, flashCut]);

  // ── HTML overlays (same data as the 2D map) ───────────────────────────────
  const overlayBackground = overlayBackgroundColor(lightMode);
  const directorCaption =
    cameraMode === "tv" && directorShot
      ? shotCaption(directorShot, (n) => driverByNumber.get(n)?.name_acronym ?? String(n))
      : null;
  // Close-up cameras lose the big picture, so they get the minimap.
  const closeUp =
    cameraMode === "tv" ||
    ((cameraMode === "chase" || cameraMode === "onboard") && focusDriver != null);
  const inShot = useMemo(() => {
    const cars = new Set<number>();
    if (cameraMode === "tv" && directorShot) {
      cars.add(directorShot.driver);
      if (directorShot.other != null) cars.add(directorShot.other);
    } else if (focusDriver != null) {
      cars.add(focusDriver);
    }
    return cars;
  }, [cameraMode, directorShot, focusDriver]);
  // One focused-car window feeds both the HUD and the speed-coloured trail.
  const { data: hudRawData } = useCarDataWindow(
    sessionKey,
    showFocusedHud || speedTrailEnabled ? focusDriver : null,
    sessionStartMs,
    chunkIndexFor(t),
    { sharedAllDriverWindow, enabled: telemetryEnabled },
  );
  const hudData = useMemo(
    () => (focusDriver === null ? null : carDataAt(hudRawData, sessionStartMs + t)),
    [hudRawData, sessionStartMs, t, focusDriver],
  );

  const focusColor =
    focusDriver !== null
      ? teamColor(driverByNumber.get(focusDriver)?.team_colour, "#ffffff")
      : "#ffffff";

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SRC_GHOST) as mapboxgl.GeoJSONSource | undefined;
    if (!map || !source || !geo) return;
    const ghost = pitRejoin?.ghost;
    if (ghost) {
      const container = containerRef.current;
      ensureGhostIcon(
        map,
        focusColor,
        carScaleFor(container?.clientWidth ?? 0, container?.clientHeight ?? 0),
      );
    }
    source.setData({
      type: "FeatureCollection",
      features: ghost
        ? [
            {
              type: "Feature",
              properties: {
                color: focusColor,
                label: `${pitRejoin.inPit ? "REJOIN" : "PIT"} P${pitRejoin.projection.position}`,
              },
              geometry: { type: "Point", coordinates: f1ToLngLat(geo, ghost.x, ghost.y) },
            },
          ]
        : [],
    });
  }, [pitRejoin, focusColor, geo, styleReady]);

  // Pit window bands and condition ticks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;
    const bands = map.getSource(SRC_PIT_WINDOW) as mapboxgl.GeoJSONSource | undefined;
    const ticks = map.getSource(SRC_PIT_TICKS) as mapboxgl.GeoJSONSource | undefined;
    const labels = map.getSource(SRC_PIT_LABELS) as mapboxgl.GeoJSONSource | undefined;
    if (!bands || !ticks || !labels) return;
    const features = buildPitWindowFeatures(geo, pitRejoin);
    bands.setData(features.bands);
    ticks.setData(features.ticks);
    labels.setData(features.labels);
  }, [pitRejoin, geo, styleReady]);

  // Speed trail: the RAF loop recolours the trail on each refresh from this.
  const trailSpeedAt = useMemo(
    () =>
      speedTrailEnabled && focusDriver !== null && hudRawData.length > 0
        ? speedLookup(hudRawData, sessionStartMs, MAP3D_TRAIL_SPEED_MAX_GAP_MS)
        : null,
    [speedTrailEnabled, focusDriver, hudRawData, sessionStartMs],
  );
  useEffect(() => {
    trailStyleRef.current = { speedAt: trailSpeedAt, color: focusColor };
  }, [trailSpeedAt, focusColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.getLayer(LAYER_TRAIL)) return;
    // Team colour until (or unless) the loop paints speed.
    map.setPaintProperty(LAYER_TRAIL, "line-gradient", trailGradient(focusColor));
  }, [focusColor, trailSpeedAt, styleReady, arc]);

  const totalMarshalPosts = Math.max(
    circuitGeom?.marshalSectors?.length ?? 0,
    circuitGeom?.marshalLights?.length ?? 0,
    trackFlagState?.maxMarshalSector ?? 0,
  );
  const timingSectorFlags = useMemo(
    () => projectToTimingSectors(trackFlagState, totalMarshalPosts),
    [trackFlagState, totalMarshalPosts],
  );

  // Sector flag colours (ribbon + sector paint), like the 2D map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    applySectorFlags(
      map,
      flagColorsEnabled ? timingSectorFlags : { 1: null, 2: null, 3: null },
    );
  }, [timingSectorFlags, flagColorsEnabled, styleReady, circuitGeom]);

  const startLights = startLightsState(t, lightsOutMs);
  useStartLightsSound(startLights, mapStartLightsSound && lightsOutMs != null);

  const statusBadges = buildStatusBadges({
    startLights,
    activeTrackVehicles,
    trackFlagState,
    timingSectorFlags,
    raceLeader: mapShowRaceLeader ? raceLeader : null,
    lightMode,
  });

  const buttonClass =
    "h-7 min-w-7 px-1.5 flex items-center justify-center border border-panel text-fg/85 hover:text-fg hover:border-fg/50 transition-colors text-caption font-black tracking-widest";

  const settingsButton = onOpenSettings && (
    <button
      type="button"
      className={buttonClass}
      title="Track map settings"
      aria-label="Track map settings"
      onClick={onOpenSettings}
    >
      <SettingsIcon size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
  const exitButton = (
    <span data-tour={TOUR_TARGET.mapViews} className="flex items-center gap-1">
      <button type="button" className={buttonClass} title="Switch to 2D map" onClick={onExit3d}>
        2D
      </button>
      {onEnterRing && (
        <button
          type="button"
          className={buttonClass}
          title="Switch to ring view (lap progress)"
          aria-label="Switch to ring view (lap progress)"
          onClick={onEnterRing}
        >
          <CircleDot size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
    </span>
  );

  // Loading / unavailable: keep the controls so the user can always switch
  // to 2D / ring or open settings.
  const fallback = (content: ReactNode) => (
    <div className="relative w-full h-full aspect-[3/2]" data-testid="track-map-3d-fallback">
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        {content}
      </div>
      <div
        className={`absolute top-2 right-2 z-20 flex items-center gap-1 p-1 ${TRACK_CONTROL_SURFACE}`}
        role="toolbar"
        aria-label="Track map controls"
      >
        {exitButton}
        {settingsButton}
      </div>
    </div>
  );

  if (!sessionKey || (token && circuitKey == null)) {
    return fallback(
      <span className="text-muted text-sm">
        {sessionKey ? "Loading track…" : "Select a session to load the track"}
      </span>,
    );
  }

  if (!token || !geo) {
    return fallback(
      <ErrorMessage
        message={
          token
            ? "3D view isn't available for this circuit yet"
            : "3D view needs a Mapbox token (VITE_MAPBOX_TOKEN)"
        }
        variant="empty"
      />,
    );
  }

  return (
    // aspect-[3/2] only applies when the parent gives no definite height (the
    // phone layout): the 2D map's SVG gets that from its viewBox, a div doesn't.
    <div
      className="relative w-full h-full aspect-[3/2] overflow-hidden"
      data-testid="track-map-3d"
    >
      {/* mapbox-gl.css forces `position: relative` on the container, so size it
          by flow (w/h-full), not by absolute insets. */}
      <div ref={containerRef} className="w-full h-full" />
      <div
        ref={cutFadeRef}
        aria-hidden="true"
        data-testid="director-cut-fade"
        className="absolute inset-0 z-10 bg-black pointer-events-none"
        style={{ opacity: 0 }}
      />

      <StatusBadges badges={statusBadges} />

      <div
        className={`absolute top-2 right-2 z-20 flex items-center gap-1 p-1 ${TRACK_CONTROL_SURFACE}`}
        role="toolbar"
        aria-label="Track map controls"
      >
        {exitButton}
        {showTrackControls && (
          <button
            type="button"
            className={
              followToggle && followFocused && !followSuspended
                ? `${buttonClass} !border-f1red text-fg`
                : buttonClass
            }
            title={followTitle}
            aria-label={followTitle}
            aria-pressed={followToggle ? followFocused && !followSuspended : undefined}
            onClick={followToggle ? toggleFollow : recenter}
          >
            {focusDriver != null ? (
              <Crosshair size={14} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Maximize size={14} strokeWidth={2.2} aria-hidden="true" />
            )}
          </button>
        )}
        {focusDriver != null && (
          <button
            type="button"
            className={showHeatmap ? `${buttonClass} !border-f1red text-fg` : buttonClass}
            title={heatmapTitle}
            aria-label={heatmapTitle}
            aria-pressed={showHeatmap}
            onClick={toggleHeatmap}
          >
            <Flame size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
        {showTrackControls && (
          <button
            type="button"
            className={buttonClass}
            title={`Camera: ${CAMERA_LABELS[cameraMode]} (click to change)`}
            aria-label={`Camera mode: ${CAMERA_LABELS[cameraMode]}`}
            onClick={cycleCameraMode}
          >
            {cameraMode === "follow" && <Navigation size={14} strokeWidth={2.2} aria-hidden="true" />}
            {cameraMode === "chase" && <Video size={14} strokeWidth={2.2} aria-hidden="true" />}
            {cameraMode === "onboard" && <Gauge size={14} strokeWidth={2.2} aria-hidden="true" />}
            {cameraMode === "orbit" && <Orbit size={14} strokeWidth={2.2} aria-hidden="true" />}
            {cameraMode === "tv" && <Tv size={14} strokeWidth={2.2} aria-hidden="true" />}
          </button>
        )}
        {showTrackScreenshot && (
          <button
            type="button"
            className={buttonClass}
            title="Download map snapshot as PNG"
            aria-label="Download map snapshot as PNG"
            onClick={() => {
              if (!mapRef.current) return;
              trackEvent("trackmap_snapshot_export", { format: "png", view: "3d" });
              exportMapSnapshot(mapRef.current);
            }}
          >
            <Camera size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
        {settingsButton}
      </div>

      {followSuspended && (focusDriver != null || cameraMode === "tv") && (
        <button
          type="button"
          onClick={recenter}
          className="absolute top-12 right-2 z-20 px-2 py-1 text-caption font-black uppercase tracking-widest border border-panel text-fg"
          style={{ background: overlayBackground, backdropFilter: "blur(4px)" }}
        >
          Resume follow
        </button>
      )}

      {miniMap && closeUp && (
        <div className="absolute bottom-9 right-2 z-20 pointer-events-none">
          <MiniMap
            projection={miniMap}
            indexes={indexes}
            driverByNumber={driverByNumber}
            t={t}
            highlight={inShot}
            retiredDrivers={retiredDrivers}
            background={overlayBackground}
            lightMode={lightMode}
          />
        </div>
      )}

      {/* Lifted clear of the Mapbox logo in the bottom-left corner. */}
      <div className="absolute bottom-9 left-2 z-20 pointer-events-none flex flex-col gap-1">
        {mapShowClock && (
          <TrackClockPanel
            nowMs={sessionStartMs + Math.max(0, t)}
            sessionGmtOffset={sessionGmtOffset}
            raining={(weatherOverlay?.rainfall ?? 0) > 0}
          />
        )}
        {weatherOverlay && (
          <WeatherPanel
            weather={weatherOverlay}
            metricSystem={metricSystem}
          />
        )}
      </div>

      {(directorCaption || (showFocusedHud && hudData) || pitRejoin) && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none flex flex-col gap-1">
          {directorCaption && (
            <div
              className="self-start flex items-center gap-1.5 px-2 py-1 text-caption font-black uppercase tracking-widest text-fg border border-panel"
              style={{ background: overlayBackground, backdropFilter: "blur(4px)" }}
              role="status"
              aria-live="polite"
            >
              <Tv size={12} strokeWidth={2.4} aria-hidden="true" />
              <span>{directorCaption}</span>
            </div>
          )}
          {focusDriver !== null && showFocusedHud && hudData && (
            <FocusedDriverHud
              sample={hudData}
              driver={driverByNumber.get(focusDriver)}
              metricSystem={metricSystem}
            />
          )}
          {focusDriver !== null && pitRejoin && (
            <PitRejoinPanel
              projection={pitRejoin.projection}
              lossS={pitRejoin.lossS}
              pitLoss={circuitGeom?.pitLoss}
              condition={pitRejoin.condition}
              inPit={pitRejoin.inPit}
              color={focusColor}
              driverByNumber={driverByNumber}
            />
          )}
        </div>
      )}
    </div>
  );
}
