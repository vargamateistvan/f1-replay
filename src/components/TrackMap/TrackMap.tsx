import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { useStartLightsSound } from "@/hooks/useStartLightsSound";
import {
  computeTrackAutoRotationDeg,
  isOffTrackPlaceholder,
  useTrackOutline,
} from "@/hooks/useTrackMap";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { buildIndex, interpolateXY } from "@/timeline/interpolate";
import {
  isActiveTrackFlag,
  projectToTimingSectors,
  type TrackFlagState,
} from "@/timeline/raceControl";
import { startLightsState } from "@/timeline/startLights";
import { useSettings } from "@/stores/settings";
import { trackEvent } from "@/lib/analytics";
import { animateMotion, motionEnabled, tabSwapMotion } from "@/lib/motion";
import type { Driver, Location, Stint, Weather } from "@/api/types";
import {
  TRACK_SVG_W as SVG_W,
  TRACK_SVG_H as SVG_H,
  TRACK_FIT_ZOOM,
  FOLLOW_ZOOM_W,
  FOLLOW_ZOOM_H,
} from "@/constants";
import { getCircuitLayout } from "@/data/circuits";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import {
  clampFollowView,
  lerpCameraView,
  type CameraView,
} from "./trackCamera";
import {
  mapBackgroundColor,
  normalizeDeg,
  overlayBackgroundColor,
} from "./trackMapFormat";
import {
  buildBrakingHotspots,
  buildDeltaSegments,
  buildElevationSegments,
  buildHeatSegments,
  buildMarshalHeatmapSegments,
  buildTrackGeometry,
  carDataAt,
  projectToSvg,
} from "./trackGeometry";
import { buildStatusBadges, type ActiveTrackVehicles } from "./statusBadges";
import { exportTrackSnapshot } from "./exportSnapshot";
import {
  DirectionArrows,
  SectorBoundaryMarkers,
  SectorClipPaths,
  StartFinishLine,
  TrackConditionRibbon,
  TrackSurface,
} from "./layers/TrackSurfaceLayers";
import {
  MarshalFlagSegments,
  SectorFlagTints,
  TrackFlagColors,
} from "./layers/FlagLayers";
import {
  BrakingHotspots,
  SpeedHeatLayer,
  TintedSegmentLayer,
} from "./layers/TelemetryLayers";
import {
  CircuitLayoutOverlays,
  CornerNumbers,
  MarshalHeatmapLayer,
  MarshalSectorDots,
} from "./layers/CircuitLayers";
import { CarLayer, type CarPosition } from "./layers/CarLayer";
import { StatusBadges } from "./overlays/StatusBadges";
import { TrackControls } from "./overlays/TrackControls";
import { TrackClockPanel, WeatherPanel } from "./overlays/InfoPanels";
import { FocusedDriverHud, LapSpeedLegend } from "./overlays/FocusedDriverHud";
import { Compass, SectorChips } from "./overlays/MapCornerWidgets";

export type { ActiveTrackVehicles } from "./statusBadges";

const ROTATION_STEP_DEG = 15;
const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;
const FOLLOW_CAMERA_FOCUS_ALPHA = 0.35;
const FOLLOW_CAMERA_RETURN_ALPHA = 0.2;

interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly sessionGmtOffset?: string | null;
  readonly focusDriver?: number | null;
  readonly pulseDrivers?: readonly number[];
  readonly circuitShortName?: string | null;
  readonly circuitKey?: number | null;
  readonly year?: number | null;
  readonly activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly focusDriverLap?: number | null;
  readonly weatherOverlay?: Weather | null;
  readonly trackFlagState?: TrackFlagState | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly safetyCarSirenOn?: boolean;
  readonly showSectorBox?: boolean;
  readonly showTrackControls?: boolean;
  readonly showCompass?: boolean;
  readonly showFocusedHud?: boolean;
  /** True when the all-driver car_data window is already being fetched
   * (leaderboard telemetry columns) — reuse it for the HUD instead of
   * per-driver requests. */
  readonly sharedAllDriverWindow?: boolean;
  readonly raceLeader?: Driver | null;
  /** Session-relative ms of race start; drives the start-lights badge. */
  readonly lightsOutMs?: number | null;
  readonly showTrackScreenshot?: boolean;
  readonly showEnhancedVisuals?: boolean;
  readonly onSelectDriver?: (driverNumber: number) => void;
  /** When set, shows a shortcut to the track map settings. */
  readonly onOpenSettings?: () => void;
}

/**
 * Orchestrates the track map: owns data hooks, zoom/rotation state and the
 * follow camera, then composes memoized SVG layers (`layers/`) and HTML
 * overlays (`overlays/`). Session-static layers only re-render when their
 * inputs change; the car layer and camera are the per-tick work.
 */
export function TrackMap({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  sessionGmtOffset = "+00:00",
  focusDriver = null,
  pulseDrivers,
  circuitShortName,
  circuitKey = null,
  year = null,
  activeCompounds,
  battlingDrivers,
  retiredDrivers,
  focusDriverLap = null,
  weatherOverlay = null,
  trackFlagState = null,
  activeTrackVehicles = null,
  safetyCarSirenOn = false,
  showSectorBox = true,
  showTrackControls = true,
  showCompass = true,
  showFocusedHud = true,
  raceLeader = null,
  lightsOutMs = null,
  sharedAllDriverWindow = false,
  showTrackScreenshot = true,
  showEnhancedVisuals = true,
  onSelectDriver,
  onOpenSettings,
}: Props) {
  const t = useCoarseTime(100);
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const mapShowDriverAcronym = useSettings((s) => s.mapShowDriverAcronym);
  const mapShowDriverNumberInside = useSettings(
    (s) => s.mapShowDriverNumberInside,
  );
  const mapShowMarshalHeatmap = useSettings((s) => s.mapShowMarshalHeatmap);
  const mapShowCornerNumbers = useSettings((s) => s.mapShowCornerNumbers);
  const mapShowElevation = useSettings((s) => s.mapShowElevation);
  const mapShowRaceLeader = useSettings((s) => s.mapShowRaceLeader);
  const mapStartLightsSound = useSettings((s) => s.mapStartLightsSound);
  const mapShowClock = useSettings((s) => s.mapShowClock);
  const isCompactViewport = useMediaQuery("(max-width: 767px)");
  const [zoomLevel, setZoomLevel] = useState(TRACK_FIT_ZOOM);
  const [rotationDeg, setRotationDeg] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const prevFocusDriverRef = useRef<number | null>(focusDriver);
  const cameraViewRef = useRef<CameraView>({ x: 0, y: 0, w: SVG_W, h: SVG_H });

  useEffect(() => {
    cameraViewRef.current = { x: 0, y: 0, w: SVG_W, h: SVG_H };
  }, [sessionKey]);

  useEffect(() => {
    if (prevFocusDriverRef.current === focusDriver) return;
    prevFocusDriverRef.current = focusDriver;
    if (!motionEnabled()) return;

    const animation = animateMotion(
      svgRef.current,
      tabSwapMotion({
        opacity: [0.65, 1],
        translateY: [8, 0],
        scale: [0.992, 1],
        duration: 260,
      }),
    );

    return () => {
      animation?.revert();
    };
  }, [focusDriver]);

  const finishPatternId = `finish-checker-${sessionKey ?? "na"}`;
  const trackSurfaceGradientId = `track-surface-gradient-${sessionKey ?? "na"}`;
  const zoomStorageKey = useMemo(
    () =>
      `f1-replay:track-zoom:v2:${sessionKey ?? "none"}:${circuitKey ?? "none"}`,
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

  const mapBackground = mapBackgroundColor(lightMode);
  const overlayBackground = overlayBackgroundColor(lightMode);

  // Rolling 5-min car_data window for the focused driver — drives the live HUD overlay.
  const chunkIdx = chunkIndexFor(t);
  const { data: hudRawData } = useCarDataWindow(
    sessionKey,
    showFocusedHud ? focusDriver : null,
    sessionStartMs,
    chunkIdx,
    { sharedAllDriverWindow },
  );

  // Baked official geometry — loaded on demand for this circuit only.
  const { data: circuitGeom, isPending: bakedPending } = useCircuitGeometry(
    circuitKey,
    year,
  );
  const hasBaked = circuitGeom != null;

  // OpenF1 reports flags per marshal post, so the three-sector view shown in the
  // chips, the ribbon and the no-geometry fallback is a projection. The
  // denominator takes the largest count available: baked marshal sectors and
  // marshal lights disagree on some circuits (Silverstone bakes 16 sectors but
  // 17 lights, and its feed uses 17), and circuits with no baked geometry at all
  // rely purely on what the feed mentions.
  const totalMarshalPosts = Math.max(
    circuitGeom?.marshalSectors?.length ?? 0,
    circuitGeom?.marshalLights?.length ?? 0,
    trackFlagState?.maxMarshalSector ?? 0,
  );
  const timingSectorFlags = useMemo(
    () => projectToTimingSectors(trackFlagState, totalMarshalPosts),
    [trackFlagState, totalMarshalPosts],
  );

  // GPS fallback (no baked data): hand the hook the ordered driver list and
  // let it try a bounded number of drivers inside one query. Iterating here
  // with a per-driver query would fire a laps request for every driver.
  const candidateDrivers = useMemo(
    () =>
      hasBaked || bakedPending ? null : drivers.map((d) => d.driver_number),
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

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Group location points by driver and build a typed-array index per driver.
  // Rebuilds only when locationData or sessionStartMs changes (not on every frame).
  const locationIndexes = useMemo(() => {
    const byDriver = new Map<
      number,
      Array<{ t: number; x: number; y: number }>
    >();
    for (const loc of locationData) {
      const relT = new Date(loc.date).getTime() - sessionStartMs;
      let arr = byDriver.get(loc.driver_number);
      if (!arr) {
        arr = [];
        byDriver.set(loc.driver_number, arr);
      }
      arr.push({ t: relT, x: loc.x, y: loc.y });
    }
    const indexes = new Map<number, ReturnType<typeof buildIndex>>();
    for (const [num, pts] of byDriver) {
      pts.sort((a, b) => a.t - b.t);
      indexes.set(num, buildIndex(pts));
    }
    return indexes;
  }, [locationData, sessionStartMs]);

  const circuitLayout = useMemo(
    () => (circuitShortName ? getCircuitLayout(circuitShortName) : null),
    [circuitShortName],
  );

  // SVG path + coordinate transform — changes once per session, not per frame.
  const trackGeometry = useMemo(
    () => (outline ? buildTrackGeometry(outline) : null),
    [outline],
  );

  const defaultRotationDeg = useMemo(
    () =>
      circuitGeom && Number.isFinite(circuitGeom.rotation)
        ? // The circuit geometry is Cartesian (Y-up), while SVG is Y-down.
          // The Y-axis reflection reverses the supplied rotation direction.
          normalizeDeg(-circuitGeom.rotation)
        : computeTrackAutoRotationDeg(outline?.points ?? [], true),
    [circuitGeom, outline],
  );

  useEffect(() => {
    if (isCompactViewport) {
      // Mobile always starts in fit-to-track mode to avoid cropped views
      // from previously persisted desktop zoom/rotation values.
      setZoomLevel(TRACK_FIT_ZOOM);
      setRotationDeg(defaultRotationDeg);
      return;
    }
    if (typeof window === "undefined") {
      setZoomLevel(TRACK_FIT_ZOOM);
      setRotationDeg(defaultRotationDeg);
      return;
    }
    try {
      const savedZoom = window.localStorage.getItem(zoomStorageKey);
      const parsedZoom = savedZoom === null ? Number.NaN : Number(savedZoom);
      setZoomLevel(
        Number.isFinite(parsedZoom)
          ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parsedZoom))
          : TRACK_FIT_ZOOM,
      );

      setRotationDeg(defaultRotationDeg);
    } catch {
      setZoomLevel(TRACK_FIT_ZOOM);
      setRotationDeg(defaultRotationDeg);
    }
  }, [isCompactViewport, zoomStorageKey, defaultRotationDeg]);

  const rotateBy = useCallback(
    (direction: "left" | "right") => {
      trackEvent("trackmap_rotation_changed", { direction });
      const step =
        direction === "left" ? -ROTATION_STEP_DEG : ROTATION_STEP_DEG;
      setRotationDeg(normalizeDeg(rotationDeg + step));
    },
    [rotationDeg],
  );
  const rotateLeft = useCallback(() => rotateBy("left"), [rotateBy]);
  const rotateRight = useCallback(() => rotateBy("right"), [rotateBy]);

  const zoomBy = useCallback(
    (delta: number) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel + delta));
      setZoomLevel(next);
      persistZoomLevel(next);
      trackEvent("trackmap_zoom_changed", { zoom: next });
    },
    [zoomLevel, persistZoomLevel],
  );
  const zoomOut = useCallback(() => zoomBy(-ZOOM_STEP), [zoomBy]);
  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomReset = useCallback(() => {
    trackEvent("trackmap_zoom_reset");
    setZoomLevel(TRACK_FIT_ZOOM);
    persistZoomLevel(TRACK_FIT_ZOOM);
  }, [persistZoomLevel]);

  // Fetch telemetry for the focused driver's last completed lap.
  // Only fires when a driver is focused and a lap number is known; result is
  // cached forever (staleTime: Infinity) so lap changes cost one extra API call.
  const heatData = useCarDataForLap(
    sessionKey,
    focusDriver,
    focusDriverLap ?? null,
  );
  const referenceHeatData = useCarDataForLap(
    sessionKey,
    focusDriver,
    focusDriverLap != null && focusDriverLap > 1 ? focusDriverLap - 1 : null,
  );

  // Derived overlay data — computed only when its layer is visible.
  const showElevation = showEnhancedVisuals && mapShowElevation && hasBaked;
  const heatSegments = useMemo(
    () => buildHeatSegments(trackGeometry, heatData.data),
    [trackGeometry, heatData.data],
  );
  const elevationSegments = useMemo(
    () =>
      showElevation
        ? buildElevationSegments(
            trackGeometry,
            locationData,
            focusDriver ?? drivers[0]?.driver_number ?? null,
            lightMode,
          )
        : [],
    [
      showElevation,
      trackGeometry,
      focusDriver,
      drivers,
      locationData,
      lightMode,
    ],
  );
  const deltaSegments = useMemo(
    () =>
      showEnhancedVisuals
        ? buildDeltaSegments(
            trackGeometry,
            heatData.data,
            referenceHeatData.data,
          )
        : [],
    [showEnhancedVisuals, trackGeometry, heatData.data, referenceHeatData.data],
  );
  const brakingHotspots = useMemo(
    () =>
      showEnhancedVisuals
        ? buildBrakingHotspots(trackGeometry, heatData.data)
        : [],
    [showEnhancedVisuals, trackGeometry, heatData.data],
  );
  // Shared by the optional marshal heatmap and the per-post flag segments.
  const marshalHeatmapSegments = useMemo(
    () =>
      buildMarshalHeatmapSegments(trackGeometry, circuitGeom?.marshalSectors),
    [trackGeometry, circuitGeom],
  );

  // Current-moment car telemetry for the focused driver — binary search on the
  // rolling 5-min window (same source as FocusedTelemetry). O(log n) per tick.
  const hudData = useMemo(
    () =>
      focusDriver === null ? null : carDataAt(hudRawData, sessionStartMs + t),
    [hudRawData, sessionStartMs, t, focusDriver],
  );

  const startLights = startLightsState(t, lightsOutMs);
  useStartLightsSound(startLights, mapStartLightsSound && lightsOutMs != null);

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

  if (!outline || !trackGeometry) {
    return (
      <div className="w-full h-full">
        <ErrorMessage
          message="No location data available for this session"
          variant="empty"
        />
      </div>
    );
  }

  const { pathData } = trackGeometry;

  // Interpolate each driver's position at the current playhead time t (session-relative ms).
  // This runs per-frame — it's the only thing that should.
  const carPositions: CarPosition[] = [];
  for (const [num, idx] of locationIndexes) {
    if (retiredDrivers?.has(num)) continue;
    const pos = interpolateXY(idx, t);
    if (!pos) continue;
    // OpenF1 reports x = y = 0 for a vehicle that is not on track: the safety
    // car that is not deployed for this event, the medical car in its bay, a
    // car sitting in the garage. Drawing those puts a stack of markers on the
    // circuit's coordinate origin.
    if (isOffTrackPlaceholder(pos)) continue;
    carPositions.push({ num, ...pos });
  }

  // Follow-cam: smoothly zooms/pans towards the focused driver. If a focused
  // car sample is temporarily missing, keep the previous camera to avoid snap-back.
  let nextViewTarget: CameraView = { x: 0, y: 0, w: SVG_W, h: SVG_H };
  if (focusDriver !== null) {
    const focusedPos = carPositions.find((c) => c.num === focusDriver);
    if (focusedPos) {
      const { sx, sy } = projectToSvg(
        trackGeometry,
        focusedPos.x,
        focusedPos.y,
      );
      nextViewTarget = clampFollowView(
        sx,
        sy,
        SVG_W,
        SVG_H,
        FOLLOW_ZOOM_W,
        FOLLOW_ZOOM_H,
      );
    } else {
      nextViewTarget = cameraViewRef.current;
    }
  }

  const cameraAlpha =
    focusDriver !== null
      ? FOLLOW_CAMERA_FOCUS_ALPHA
      : FOLLOW_CAMERA_RETURN_ALPHA;
  const smoothedView = lerpCameraView(
    cameraViewRef.current,
    nextViewTarget,
    cameraAlpha,
  );
  cameraViewRef.current = smoothedView;

  const { x: viewX, y: viewY, w: viewW, h: viewH } = smoothedView;
  const viewBox = `${viewX.toFixed(1)} ${viewY.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`;
  const pivotX = viewX + viewW / 2;
  const pivotY = viewY + viewH / 2;
  const zoomTransform = `translate(${pivotX.toFixed(1)} ${pivotY.toFixed(1)}) scale(${zoomLevel.toFixed(2)}) translate(${-pivotX.toFixed(1)} ${-pivotY.toFixed(1)})`;
  const trackTransform = `rotate(${rotationDeg.toFixed(1)} ${pivotX.toFixed(1)} ${pivotY.toFixed(1)}) ${zoomTransform}`;

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
        viewBox={viewBox}
        className="w-full h-full"
        style={{ background: mapBackground }}
      >
        <defs>
          <linearGradient
            id={trackSurfaceGradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={lightMode ? "#eaf1ff" : "#303949"} />
            <stop offset="52%" stopColor={lightMode ? "#cdd8ed" : "#202835"} />
            <stop offset="100%" stopColor={lightMode ? "#aebad0" : "#141922"} />
          </linearGradient>
          <pattern
            id={finishPatternId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="4" height="4" fill="#ffffff" />
            <rect x="0" y="0" width="2" height="2" fill="#111111" />
            <rect x="2" y="2" width="2" height="2" fill="#111111" />
          </pattern>
          <SectorClipPaths geom={trackGeometry} circuitLayout={circuitLayout} />
        </defs>
        {/* Paint order matters: ribbon → surface → flags → telemetry →
            circuit markup → markers → cars. */}
        <g transform={trackTransform}>
          {showEnhancedVisuals && (
            <TrackConditionRibbon
              pathData={pathData}
              timingSectorFlags={timingSectorFlags}
              circuitLayout={circuitLayout}
              lightMode={lightMode}
            />
          )}
          {showElevation && (
            <TintedSegmentLayer
              segments={elevationSegments}
              keyPrefix="elev-shadow"
              strokeWidth={14}
              opacityScale={0.15}
            />
          )}
          <TrackSurface
            pathData={pathData}
            gradientId={trackSurfaceGradientId}
            lightMode={lightMode}
          />
          {trackFlagState && (
            <TrackFlagColors
              pathData={pathData}
              trackFlagState={trackFlagState}
              timingSectorFlags={timingSectorFlags}
              circuitLayout={circuitLayout}
            />
          )}
          <SpeedHeatLayer segments={heatSegments} />
          {showEnhancedVisuals && (
            <TintedSegmentLayer
              segments={deltaSegments}
              keyPrefix="delta"
              strokeWidth={7.5}
            />
          )}
          {showElevation && (
            <TintedSegmentLayer
              segments={elevationSegments}
              keyPrefix="elev-accent"
              strokeWidth={2.2}
            />
          )}
          {mapShowMarshalHeatmap && (
            <MarshalHeatmapLayer
              pathData={pathData}
              segments={marshalHeatmapSegments}
            />
          )}
          <CircuitLayoutOverlays
            geom={trackGeometry}
            circuitLayout={circuitLayout}
            hasBaked={hasBaked}
          />
          {mapShowMarshalHeatmap && (
            <MarshalSectorDots
              geom={trackGeometry}
              circuitGeom={circuitGeom ?? null}
            />
          )}
          {trackFlagState && (
            <SectorFlagTints
              geom={trackGeometry}
              circuitGeom={circuitGeom ?? null}
              circuitLayout={circuitLayout}
              trackFlagState={trackFlagState}
              timingSectorFlags={timingSectorFlags}
            />
          )}
          <MarshalFlagSegments
            pathData={pathData}
            segments={marshalHeatmapSegments}
            trackFlagState={trackFlagState}
          />
          {mapShowCornerNumbers && (
            <CornerNumbers
              geom={trackGeometry}
              circuitGeom={circuitGeom ?? null}
              rotationDeg={rotationDeg}
              lightMode={lightMode}
            />
          )}
          {showEnhancedVisuals && (
            <BrakingHotspots hotspots={brakingHotspots} />
          )}
          <StartFinishLine
            geom={trackGeometry}
            patternId={finishPatternId}
            lightMode={lightMode}
          />
          {showEnhancedVisuals && (
            <>
              <SectorBoundaryMarkers
                geom={trackGeometry}
                rotationDeg={rotationDeg}
                lightMode={lightMode}
              />
              <DirectionArrows geom={trackGeometry} lightMode={lightMode} />
            </>
          )}

          <CarLayer
            geom={trackGeometry}
            carPositions={carPositions}
            driverByNumber={driverByNumber}
            focusDriver={focusDriver}
            pulseDrivers={pulseDrivers}
            battlingDrivers={battlingDrivers}
            activeCompounds={activeCompounds}
            safetyCarSirenOn={safetyCarSirenOn}
            rotationDeg={rotationDeg}
            lightMode={lightMode}
            showAcronym={mapShowDriverAcronym}
            showNumberInside={mapShowDriverNumberInside}
            onSelectDriver={onSelectDriver}
          />
        </g>

        {/* No-data hint — kept in a separate transformed group so it rotates with track */}
        {locationIndexes.size === 0 && (
          <g transform={trackTransform}>
            <text
              x={SVG_W / 2}
              y={SVG_H / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${-rotationDeg.toFixed(1)} ${SVG_W / 2} ${SVG_H / 2})`}
              fill="#636369"
              fontSize={11}
              fontFamily="Inter, sans-serif"
            >
              Press ▶ to start replay
            </text>
          </g>
        )}
      </svg>

      <TrackControls
        showTrackControls={showTrackControls}
        overlayBackground={overlayBackground}
        onRotateLeft={rotateLeft}
        onRotateRight={rotateRight}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onZoomReset={zoomReset}
        onOpenSettings={onOpenSettings}
      />

      {focusDriver !== null && heatSegments.length > 0 && heatData.data && (
        <LapSpeedLegend
          samples={heatData.data}
          metricSystem={metricSystem}
          overlayBackground={overlayBackground}
        />
      )}

      {outline.source === "layout" && (
        <div
          className="absolute top-14 right-2 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/80 border border-panel"
          style={{
            background: overlayBackground,
            backdropFilter: "blur(4px)",
          }}
          title="Using coarse circuit layout fallback because baked geometry and GPS outline data were unavailable"
        >
          Fallback layout
        </div>
      )}

      {/* Bottom-left overlays: track clock + weather */}
      <div className="absolute bottom-2 left-2 z-20 pointer-events-none flex flex-col gap-1">
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

      {showFocusedHud && hudData && focusDriver !== null && (
        <FocusedDriverHud
          sample={hudData}
          driver={driverByNumber.get(focusDriver)}
          metricSystem={metricSystem}
          lightMode={lightMode}
        />
      )}

      {/* PNG export — only shown when there is track + car data to capture */}
      {locationIndexes.size > 0 && (
        <div className="absolute bottom-2 right-2 z-20 flex flex-row items-end gap-2">
          {showSectorBox && hasTrackConditionDisplay && (
            <SectorChips
              timingSectorFlags={timingSectorFlags}
              overlayBackground={overlayBackground}
            />
          )}
          <div className="flex flex-col items-end gap-1">
            {showCompass && <Compass rotationDeg={rotationDeg} />}
            {showTrackScreenshot && (
              <button
                onClick={() => {
                  if (!svgRef.current) return;
                  trackEvent("trackmap_snapshot_export", { format: "png" });
                  exportTrackSnapshot(svgRef.current);
                }}
                className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-track/80 border border-panel text-muted hover:text-white hover:border-white/30 transition-colors backdrop-blur-sm"
                title="Download track snapshot as PNG"
              >
                ↓ PNG
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
