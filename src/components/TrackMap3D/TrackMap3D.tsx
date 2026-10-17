import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Camera,
  Crosshair,
  Maximize,
  Navigation,
  Orbit,
  Settings as SettingsIcon,
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
  carDataAt,
} from "@/components/TrackMap/trackGeometry";
import { overlayBackgroundColor } from "@/components/TrackMap/trackMapFormat";
import {
  MAP3D_CAR_UPDATE_MS,
  MAP3D_CHASE_ALPHA,
  MAP3D_FRAME_BUDGET_MS,
  MAP3D_FLAG_WIDTH_M,
  MAP3D_FOLLOW_BEARING_ALPHA,
  MAP3D_FOLLOW_CENTER_ALPHA,
  MAP3D_FOLLOW_PITCH,
  MAP3D_FOLLOW_ZOOM,
  MAP3D_HEADING_LOOKBACK_MS,
  MAP3D_OVERVIEW_PITCH,
  MAP3D_STYLE_URL,
  MAP3D_TERRAIN_EXAGGERATION,
  MAP3D_TRACK_WIDTH_M,
  MAP3D_TRAIL_MS,
  MAP3D_TRAIL_STEP_MS,
} from "@/constants";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import { getPitLane } from "@/data/pitLanes";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useStartLightsSound } from "@/hooks/useStartLightsSound";
import { isOffTrackPlaceholder } from "@/hooks/useTrackMap";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { useTimeline } from "@/timeline/clock";
import { buildDriverIndexes, interpolateXY } from "@/timeline/interpolate";
import {
  projectToTimingSectors,
  type TrackFlagState,
} from "@/timeline/raceControl";
import { startLightsState } from "@/timeline/startLights";
import { teamColor } from "@/utils/color";
import { enuToLngLat, f1ToEnu, f1ToLngLat } from "@/utils/georef";
import { parsePitLoss, pitRejoinView } from "@/utils/pitRejoin";
import {
  addOverlayLayers,
  ensureGhostIcon,
  setOverlayGradients,
  setOverlayVisibility,
  SRC_GHOST,
  SRC_HOTSPOTS,
  SRC_TRAIL,
  LAYER_TRAIL,
} from "./overlayLayers";
import {
  buildArcPolyline,
  buildHotspotPoints,
  buildTrail,
  gradientFromSegments,
  heatColors,
  trailGradient,
} from "./trackOverlays";
import {
  isBrightPreset,
  lightPresetAt,
  lightPresetForTheme,
  rainFor,
  type LightPreset,
} from "./atmosphere";
import { mapboxToken } from "./availability";
import { addTrackSurfaceLayers, applyTrackPalette, fadeOut } from "./surfaceLayers";
import { buildTrackSurface } from "./trackSurface";
import { createFrameProbe, map3dDebugEnabled } from "./frameProbe";
import {
  chasePose,
  frameAlpha,
  nextCameraMode,
  orbitBearing,
  type CameraMode,
} from "./cameraModes";
import { exportMapSnapshot } from "./exportSnapshot3d";
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
const SRC_CORNERS = "map3d-corners";
const SRC_PIT_LANE = "map3d-pit-lane";
const SRC_DEM = "map3d-dem";
const LAYER_TRACK_SURFACE = "map3d-track-surface";
const LAYER_CORNERS = "map3d-corners";
const FIT_PADDING = 48;

const CAMERA_LABELS: Record<CameraMode, string> = {
  follow: "follow",
  chase: "chase",
  orbit: "orbit",
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
  for (const layer of buildCarLayers(scale, performance.now())) {
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
  readonly sessionGmtOffset?: string | null;
  readonly focusDriver?: number | null;
  readonly circuitKey?: number | null;
  readonly year?: number | null;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly pulseDrivers?: readonly number[];
  readonly activeCompounds?: CarFeatureInput["activeCompounds"];
  readonly safetyCarSirenOn?: boolean;
  readonly weatherOverlay?: Weather | null;
  readonly trackFlagState?: TrackFlagState | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly showTrackControls?: boolean;
  readonly showEnhancedVisuals?: boolean;
  readonly showTrackScreenshot?: boolean;
  /** Focused driver's current lap; drives speed heat / delta / braking overlays. */
  readonly focusDriverLap?: number | null;
  /** Latest gap to leader per driver; enables the pit rejoin ghost (races only). */
  readonly pitRejoinGaps?: ReadonlyMap<number, number> | null;
  readonly showFocusedHud?: boolean;
  readonly sharedAllDriverWindow?: boolean;
  readonly raceLeader?: Driver | null;
  readonly lightsOutMs?: number | null;
  readonly onSelectDriver?: (driverNumber: number) => void;
  readonly onOpenSettings?: () => void;
  /** Switch back to the 2D map. */
  readonly onExit3d: () => void;
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
  trackFlagState = null,
  activeTrackVehicles = null,
  showTrackControls = true,
  showTrackScreenshot = true,
  showEnhancedVisuals = true,
  focusDriverLap = null,
  pitRejoinGaps = null,
  showFocusedHud = true,
  sharedAllDriverWindow = false,
  raceLeader = null,
  lightsOutMs = null,
  onSelectDriver,
  onOpenSettings,
  onExit3d,
}: Props) {
  const t = useCoarseTime(100);
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const mapShowCornerNumbers = useSettings((s) => s.mapShowCornerNumbers);
  const mapShowRaceLeader = useSettings((s) => s.mapShowRaceLeader);
  const mapStartLightsSound = useSettings((s) => s.mapStartLightsSound);
  const mapShowClock = useSettings((s) => s.mapShowClock);
  const mapShowDriverAcronym = useSettings((s) => s.mapShowDriverAcronym);
  const mapShowElevation = useSettings((s) => s.mapShowElevation);
  const sessionLighting = useSettings((s) => s.mapView3dSessionLighting);
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

  // ── Telemetry overlays (same data and builders as the 2D map) ─────────────
  const arc = useMemo(
    () => (circuitGeom && geo ? buildArcPolyline(circuitGeom, geo) : null),
    [circuitGeom, geo],
  );
  const heatData = useCarDataForLap(sessionKey, focusDriver, focusDriverLap ?? null);
  const referenceHeatData = useCarDataForLap(
    sessionKey,
    focusDriver,
    focusDriverLap != null && focusDriverLap > 1 ? focusDriverLap - 1 : null,
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

  // Inputs the RAF loop reads each frame. Synced after commit; `dirty` forces a
  // car redraw even when the playhead is paused.
  const pulseSet = useMemo(() => new Set(pulseDrivers ?? []), [pulseDrivers]);
  const carInput: CarFeatureInput = {
    indexes,
    driverByNumber,
    focusDriver,
    battlingDrivers,
    retiredDrivers,
    pulseDrivers: pulseSet,
    activeCompounds,
    safetyCarSirenOn,
    showAcronym: mapShowDriverAcronym,
    showNumberInside: mapShowDriverNumberInside,
    lightMode,
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
    retiredDrivers,
    pulseSet,
    activeCompounds,
    safetyCarSirenOn,
    mapShowDriverAcronym,
    mapShowDriverNumberInside,
    lightMode,
  ]);

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
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const cameraModeRef = useRef<CameraMode>(cameraMode);
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
          ...(window.matchMedia?.("(max-width: 767px)").matches ? COMPACT_BASEMAP_CONFIG : {}),
        },
      },
      center: [geo.originLng, geo.originLat],
      zoom: 14,
      pitch: MAP3D_OVERVIEW_PITCH,
      antialias: true,
    });
    mapRef.current = map;
    // Each Map instance is a billed Mapbox map load.
    trackEvent("trackmap3d_map_load", { circuit_key: circuitKeyRef.current ?? -1 });

    map.on("style.load", () => {
      if (!map.getSource(SRC_DEM)) {
        map.addSource(SRC_DEM, {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: SRC_DEM, exaggeration: MAP3D_TERRAIN_EXAGGERATION });
      // CC0 car model by Kenney (public/models/LICENSE-kenney-car-kit.txt).
      map.addModel(
        CAR_MODEL_ID,
        new URL(`${import.meta.env.BASE_URL}models/f1-car.glb`, window.location.href).href,
      );
      setStyleReady(true);
    });

    // Any hand-driven camera move pauses the follow camera until "recenter".
    const suspendFollow = (e: object) => {
      const byUser = "originalEvent" in e && e.originalEvent != null;
      if (!byUser || liveRef.current.focusDriver == null) return;
      followRef.current.suspended = true;
      setFollowSuspended(true);
    };
    map.on("dragstart", suspendFollow);
    map.on("rotatestart", suspendFollow);
    map.on("pitchstart", suspendFollow);

    syncCarScale(map, liveRef.current.focusDriver != null, true);
    map.on("resize", () => syncCarScale(map, liveRef.current.focusDriver != null));

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
    applyTrackPalette(map, lightPreset);
  }, [lightPreset, styleReady, circuitGeom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    // Compound badge outlines and safety car text follow the theme.
    clearCarIcons(map, carIconsRef.current);
    liveRef.current.dirty = true;
  }, [lightMode, styleReady]);

  const rain = rainFor(weatherOverlay);
  const rainKey = rain ? `${rain.density.toFixed(2)}|${rain.intensity.toFixed(2)}` : "dry";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    map.setRain(rain ? { density: rain.density, intensity: rain.intensity } : null);
    // rainKey captures `rain`; the object itself is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainKey, styleReady]);

  // ── Static circuit layers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !circuitGeom || !geo || !trackLine) return;
    const lat = geo.originLat;

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
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "active"], false],
            0.8,
            0,
          ],
          "line-blur": 2,
          "line-width": groundWidthExpression(MAP3D_FLAG_WIDTH_M, lat, 6),
        },
      });
      const pitLane = getPitLane(circuitKey);
      if (pitLane) {
        map.addSource(SRC_PIT_LANE, {
          type: "geojson",
          data: buildPitLaneLine(pitLane, geo),
        });
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
      addTrackSurfaceLayers(
        map,
        buildTrackSurface(circuitGeom, geo, pitLane),
        lightPresetRef.current,
        "map3d-flags",
      );
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
    for (const ms of circuitGeom.marshalSectors) {
      const color = marshalSegmentColor(trackFlagState, ms.number);
      map.setFeatureState(
        { source: SRC_MARSHAL, id: ms.number },
        { active: color !== null, color: color ?? "#000000" },
      );
    }
  }, [trackFlagState, styleReady, circuitGeom]);

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
  }, [showEnhancedVisuals, styleReady, arc]);

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
    if (mapRef.current) syncCarScale(mapRef.current, focusDriver != null);
    if (focusDriver == null && styleReady) fitOverview(1200);
    // Re-run only on focus changes, not when the overview callback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDriver]);

  // ── Per-frame loop: car markers + follow camera ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !geo) return;
    let raf = 0;
    let lastCarUpdate = -Infinity;
    let lastTrailUpdate = -Infinity;
    let lastFrame = performance.now();
    let lastT = Number.NaN;

    const probe = map3dDebugEnabled()
      ? createFrameProbe(2000, (s) =>
          console.info(
            `[map3d] ${s.frames} frames · work avg ${s.avgMs.toFixed(2)} ms · max ${s.maxMs.toFixed(2)} ms (budget ${MAP3D_FRAME_BUDGET_MS} ms)`,
          ),
        )
      : null;

    const step = (now: number) => {
      const { t: playhead } = useTimeline.getState();
      const live = liveRef.current;

      if (
        now - lastCarUpdate >= MAP3D_CAR_UPDATE_MS &&
        (playhead !== lastT || live.dirty)
      ) {
        const source = map.getSource(CAR_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (source) {
          const cars = buildCarFeatures(geo, playhead, live);
          ensureCarIcons(map, cars, carScaleRef.current, live.lightMode, carIconsRef.current);
          source.setData(cars);
          lastT = playhead;
          lastCarUpdate = now;
          live.dirty = false;
        }
      }

      // Focused car's trail, refreshed at ~10 Hz.
      if (now - lastTrailUpdate >= 100) {
        lastTrailUpdate = now;
        const trailSource = map.getSource(SRC_TRAIL) as mapboxgl.GeoJSONSource | undefined;
        const idx = live.focusDriver != null ? live.indexes.get(live.focusDriver) : undefined;
        const trail = idx
          ? buildTrail(idx, playhead, geo, MAP3D_TRAIL_MS, MAP3D_TRAIL_STEP_MS)
          : null;
        trailSource?.setData({ type: "FeatureCollection", features: trail ? [trail] : [] });
      }

      // Pulse / siren rings animate like the 2D SVG <animate> rings.
      if (live.pulseDrivers?.size || live.safetyCarSirenOn) {
        const style = map as unknown as StyleSetters;
        for (const [layer, key, value] of animatedCarPaint(carScaleRef.current, now)) {
          style.setPaintProperty(layer, key, value);
        }
      }

      const follow = followRef.current;
      const mode = cameraModeRef.current;
      // Raw frame time drives the smoothing (slow frames catch up more); the
      // orbit uses a capped one so a stall doesn't spin the map.
      const frameMs = now - lastFrame;
      const dt = Math.min(100, frameMs);
      lastFrame = now;
      if (follow.suspended) return;

      if (live.focusDriver == null) {
        // Nothing to follow: orbit circles the overview, other modes hold still.
        if (mode === "orbit") map.jumpTo({ bearing: orbitBearing(map.getBearing(), dt) });
        return;
      }
      const idx = live.indexes.get(live.focusDriver);
      if (!idx) return;
      // Aim at the instant the car markers were last drawn, not the live
      // playhead: markers update at ~30 Hz through a worker, and at high
      // playback speeds the gap is long enough for the chase camera to pass
      // the car it's chasing.
      const camT = Number.isNaN(lastT) ? playhead : lastT;
      const pos = interpolateXY(idx, camT);
      if (!pos || isOffTrackPlaceholder(pos)) return;
      const prev = interpolateXY(idx, camT - MAP3D_HEADING_LOOKBACK_MS);
      const [lng, lat] = f1ToLngLat(geo, pos.x, pos.y);
      const heading = prev ? headingDeg(geo, prev, pos) : null;

      if (mode === "chase") {
        const chase = chaseRef.current;
        chase.heading =
          heading === null
            ? chase.heading
            : chase.heading === null
              ? heading
              : lerpAngleDeg(
                  chase.heading,
                  heading,
                  frameAlpha(MAP3D_FOLLOW_BEARING_ALPHA * 2, frameMs),
                );
        if (chase.heading === null) return;
        const pose = chasePose(f1ToEnu(geo, pos.x, pos.y), chase.heading);
        const eyeAlpha = frameAlpha(MAP3D_CHASE_ALPHA, frameMs);
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
    return () => cancelAnimationFrame(raf);
  }, [styleReady, geo]);

  const recenter = useCallback(() => {
    trackEvent("trackmap3d_recenter");
    followRef.current = { suspended: false, approaching: true };
    setFollowSuspended(false);
    if (focusDriver == null) fitOverview(800);
  }, [focusDriver, fitOverview]);

  const cycleCameraMode = useCallback(() => {
    const next = nextCameraMode(cameraModeRef.current);
    trackEvent("trackmap3d_camera_mode_changed", { mode: next });
    cameraModeRef.current = next;
    followRef.current = { suspended: false, approaching: true };
    chaseRef.current = { eye: null, heading: null };
    setFollowSuspended(false);
    setCameraMode(next);
  }, []);

  // ── HTML overlays (same data as the 2D map) ───────────────────────────────
  const overlayBackground = overlayBackgroundColor(lightMode);
  const { data: hudRawData } = useCarDataWindow(
    sessionKey,
    showFocusedHud ? focusDriver : null,
    sessionStartMs,
    chunkIndexFor(t),
    { sharedAllDriverWindow },
  );
  const hudData = useMemo(
    () => (focusDriver === null ? null : carDataAt(hudRawData, sessionStartMs + t)),
    [hudRawData, sessionStartMs, t, focusDriver],
  );

  const pitLoss = useMemo(() => parsePitLoss(circuitGeom?.pitLoss), [circuitGeom]);
  const pitRejoin = useMemo(
    () =>
      pitRejoinView({
        gaps: pitRejoinGaps,
        pitLoss,
        track: activeTrackVehicles,
        focusDriver,
        excluded: retiredDrivers,
        index: focusDriver !== null ? indexes.get(focusDriver) : undefined,
        t,
      }),
    [pitRejoinGaps, pitLoss, activeTrackVehicles, focusDriver, retiredDrivers, indexes, t],
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
              properties: { color: focusColor, position: pitRejoin.projection.position },
              geometry: { type: "Point", coordinates: f1ToLngLat(geo, ghost.x, ghost.y) },
            },
          ]
        : [],
    });
  }, [pitRejoin, focusColor, geo, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.getLayer(LAYER_TRAIL)) return;
    map.setPaintProperty(LAYER_TRAIL, "line-gradient", trailGradient(focusColor));
  }, [focusColor, styleReady, arc]);

  const totalMarshalPosts = Math.max(
    circuitGeom?.marshalSectors?.length ?? 0,
    circuitGeom?.marshalLights?.length ?? 0,
    trackFlagState?.maxMarshalSector ?? 0,
  );
  const timingSectorFlags = useMemo(
    () => projectToTimingSectors(trackFlagState, totalMarshalPosts),
    [trackFlagState, totalMarshalPosts],
  );

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

  if (!sessionKey || (token && circuitKey == null)) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        {sessionKey ? "Loading track…" : "Select a session to load the track"}
      </div>
    );
  }

  if (!token || !geo) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <ErrorMessage
          message={
            token
              ? "3D view isn't available for this circuit yet"
              : "3D view needs a Mapbox token (VITE_MAPBOX_TOKEN)"
          }
          variant="empty"
        />
        <button
          type="button"
          onClick={onExit3d}
          className="px-3 py-1 text-xs font-bold uppercase tracking-widest border border-panel text-muted hover:text-white"
        >
          Back to 2D
        </button>
      </div>
    );
  }

  const buttonClass =
    "h-7 min-w-7 px-1.5 flex items-center justify-center border border-panel text-white/85 hover:text-white hover:border-white/50 transition-colors text-[10px] font-black tracking-widest";

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

      <StatusBadges badges={statusBadges} />

      <div
        className="absolute top-2 right-2 z-20 flex items-center gap-1 p-1"
        style={{ background: overlayBackground, backdropFilter: "blur(4px)" }}
      >
        <button
          type="button"
          className={buttonClass}
          title="Switch to 2D map"
          onClick={onExit3d}
        >
          2D
        </button>
        {showTrackControls && (
          <button
            type="button"
            className={buttonClass}
            title={focusDriver != null ? "Follow focused car" : "Fit track"}
            aria-label={focusDriver != null ? "Follow focused car" : "Fit track"}
            onClick={recenter}
          >
            {focusDriver != null ? (
              <Crosshair size={14} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Maximize size={14} strokeWidth={2.2} aria-hidden="true" />
            )}
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
            {cameraMode === "orbit" && <Orbit size={14} strokeWidth={2.2} aria-hidden="true" />}
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
        {onOpenSettings && (
          <button
            type="button"
            className={buttonClass}
            title="Track map settings"
            aria-label="Track map settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      {followSuspended && focusDriver != null && (
        <button
          type="button"
          onClick={recenter}
          className="absolute top-12 right-2 z-20 px-2 py-1 text-[10px] font-black uppercase tracking-widest border border-panel text-white"
          style={{ background: overlayBackground, backdropFilter: "blur(4px)" }}
        >
          Resume follow
        </button>
      )}

      {/* Lifted clear of the Mapbox logo in the bottom-left corner. */}
      <div className="absolute bottom-9 left-2 z-20 pointer-events-none flex flex-col gap-1">
        {mapShowClock && (
          <TrackClockPanel
            nowMs={sessionStartMs + Math.max(0, t)}
            sessionGmtOffset={sessionGmtOffset}
            lightMode={lightMode}
            raining={(weatherOverlay?.rainfall ?? 0) > 0}
          />
        )}
        {weatherOverlay && (
          <WeatherPanel
            weather={weatherOverlay}
            metricSystem={metricSystem}
            lightMode={lightMode}
          />
        )}
      </div>

      {((showFocusedHud && hudData) || pitRejoin) && focusDriver !== null && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none flex flex-col gap-1">
          {showFocusedHud && hudData && (
            <FocusedDriverHud
              sample={hudData}
              driver={driverByNumber.get(focusDriver)}
              metricSystem={metricSystem}
              lightMode={lightMode}
            />
          )}
          {pitRejoin && (
            <PitRejoinPanel
              projection={pitRejoin.projection}
              lossS={pitRejoin.lossS}
              condition={pitRejoin.condition}
              color={focusColor}
              background={lightMode ? "rgba(247,249,254,0.94)" : "rgba(21,21,30,0.85)"}
              driverByNumber={driverByNumber}
            />
          )}
        </div>
      )}
    </div>
  );
}
