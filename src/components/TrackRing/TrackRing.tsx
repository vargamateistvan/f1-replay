import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CircleHelp, FlipHorizontal2, Timer } from "lucide-react";
import type { Driver, Interval, Location, Stint, Weather } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import {
  RING_LABEL_MIN_GAP,
  RING_LABEL_RADIUS,
  FLAG_COLORS,
  RING_PIT_RADIUS,
  RING_RADIUS,
  RING_REF_REFRESH_MS,
  RING_SVG_H,
  RING_SVG_W,
} from "@/constants";
import { getPitLane } from "@/data/pitLanes";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { useStartLightsSound } from "@/hooks/useStartLightsSound";
import { isOffTrackPlaceholder, useTrackOutline } from "@/hooks/useTrackMap";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { buildDriverIndexes, interpolateXY } from "@/timeline/interpolate";
import { alternativePitLosses, parsePitLoss, pitRejoinView, pitWindowRivals } from "@/utils/pitRejoin";
import {
  isActiveTrackFlag,
  projectToTimingSectors,
  type TrackFlagState,
} from "@/timeline/raceControl";
import { startLightsState } from "@/timeline/startLights";
import { exportTrackSnapshot } from "../TrackMap/exportSnapshot";
import { FocusedDriverHud } from "../TrackMap/overlays/FocusedDriverHud";
import { TrackClockPanel, WeatherPanel } from "../TrackMap/overlays/InfoPanels";
import { SectorChips } from "../TrackMap/overlays/MapCornerWidgets";
import { StatusBadges } from "../TrackMap/overlays/StatusBadges";
import { TrackControls, type TrackControlButton } from "../TrackMap/overlays/TrackControls";
import { buildStatusBadges, type ActiveTrackVehicles } from "../TrackMap/statusBadges";
import { buildTrackGeometry, carDataAt, projectToSvg } from "../TrackMap/trackGeometry";
import { mapBackgroundColor, overlayBackgroundColor } from "../TrackMap/trackMapFormat";
import type { LapTimeProfile } from "./lapTimeProfile";
import {
  buildReferenceProfile,
  buildRingModel,
  formatFocusGap,
  formatLapTime,
  formatRingGap,
  lapTimeFraction,
  layoutRingCars,
  placeCar,
  signedTimeDelta,
  toDisplay,
  type RingCar,
  type RingScale,
} from "./ringModel";
import {
  RingCars,
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
  readonly sessionGmtOffset?: string | null;
  readonly focusDriver?: number | null;
  readonly pulseDrivers?: readonly number[];
  readonly circuitShortName?: string | null;
  readonly circuitKey?: number | null;
  readonly year?: number | null;
  readonly activeCompounds?: ReadonlyMap<number, { compound: Stint["compound"]; age: number }>;
  readonly battlingDrivers?: ReadonlySet<number>;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly weatherOverlay?: Weather | null;
  readonly trackFlagState?: TrackFlagState | null;
  readonly activeTrackVehicles?: ActiveTrackVehicles | null;
  readonly safetyCarSirenOn?: boolean;
  readonly showSectorBox?: boolean;
  readonly showFocusedHud?: boolean;
  /** True when the all-driver car_data window is already being fetched. */
  readonly sharedAllDriverWindow?: boolean;
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
  sessionGmtOffset = "+00:00",
  focusDriver = null,
  pulseDrivers,
  circuitShortName,
  circuitKey = null,
  year = null,
  activeCompounds,
  battlingDrivers,
  retiredDrivers,
  weatherOverlay = null,
  trackFlagState = null,
  activeTrackVehicles = null,
  safetyCarSirenOn = false,
  showSectorBox = true,
  showFocusedHud = true,
  sharedAllDriverWindow = false,
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
  const t = useCoarseTime(100);
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
  const setSetting = useSettings((s) => s.setSetting);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverDriver, setHoverDriver] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const patternId = `ring-finish-checker-${sessionKey ?? "na"}`;

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

  const driverByNumber = useMemo(() => new Map(drivers.map((d) => [d.driver_number, d])), [drivers]);
  const locationIndexes = useMemo(
    () => buildDriverIndexes(locationData, sessionStartMs),
    [locationData, sessionStartMs],
  );

  // Last matched lap segment per car: keeps the search local (and on the right
  // stretch where a track crosses itself). Reset with the geometry.
  const hintsRef = useRef(new Map<number, number>());
  // Last good reference lap (and the playhead it was built at). A new one
  // replaces it unless it is much slower (safety car laps) and nearby in time.
  const profileRef = useRef<{ profile: LapTimeProfile; t: number } | null>(null);
  useEffect(() => {
    hintsRef.current = new Map();
    profileRef.current = null;
  }, [model]);

  const refBucket = Math.floor(t / RING_REF_REFRESH_MS);
  const profile = useMemo(() => {
    if (!timeScale || !model || !trackGeometry) return null;
    const tNow = refBucket * RING_REF_REFRESH_MS;
    const fresh = buildReferenceProfile(model, trackGeometry, locationIndexes, tNow);
    const prev = profileRef.current;
    if (
      fresh &&
      (!prev ||
        fresh.lapMs <= prev.profile.lapMs * 1.15 ||
        Math.abs(tNow - prev.t) > 10 * 60_000)
    ) {
      profileRef.current = { profile: fresh, t: tNow };
    }
    return profileRef.current?.profile ?? null;
  }, [timeScale, model, trackGeometry, locationIndexes, refBucket]);
  const scale: RingScale = useMemo(() => ({ profile, reverse }), [profile, reverse]);

  const pitLoss = useMemo(() => parsePitLoss(circuitGeom?.pitLoss), [circuitGeom]);
  // Stale 0 s gaps on cars that don't lead would make the rejoin order
  // ambiguous (projectPitRejoin then gives up): drop them.
  const rejoinGaps = useMemo(() => {
    if (!pitRejoinGaps || leaderNumber === null) return pitRejoinGaps;
    const out = new Map<number, number>();
    for (const [num, gap] of pitRejoinGaps) {
      if (gap > 0 || num === leaderNumber) out.set(num, gap);
    }
    return out;
  }, [pitRejoinGaps, leaderNumber]);
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
    { sharedAllDriverWindow },
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
  }
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
      for (const num of [...(rivals?.passedBy ?? []), ...(rivals?.dropBehind ?? [])]) highlightDrivers.add(num);
    }
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
        detail: `Avg. of ${profile.laps} recent lap${profile.laps === 1 ? "" : "s"} · spaced by time`,
      }
    : {
        title: "Spaced by distance",
        detail: timeScale ? "Time spacing after the first full lap" : "Time spacing is off",
      };
  const extraButtons: TrackControlButton[] = [
    {
      key: "legend",
      title: legendOpen ? "Hide ring legend" : "Show ring legend",
      icon: <CircleHelp size={14} strokeWidth={2.2} aria-hidden />,
      active: legendOpen,
      onPress: () => setLegendOpen((open) => !open),
    },
    {
      key: "time",
      title: timeScale ? "Space by distance" : "Space by lap time",
      icon: <Timer size={14} strokeWidth={2.2} aria-hidden />,
      active: timeScale,
      onPress: () => setSetting("mapRingTimeScale", !timeScale),
    },
    {
      key: "flip",
      title: "Flip the direction of travel",
      icon: <FlipHorizontal2 size={14} strokeWidth={2.2} aria-hidden />,
      active: reverse,
      onPress: () => setSetting("mapRingReverse", !reverse),
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
        <RingCenter
          cx={CX}
          cy={CY}
          lapLabel={lapLabel && lapLabel !== "—" ? lapLabel : null}
          status={status}
          reference={reference}
          gapCaption={
            gapText
              ? effectiveGapMode === "focus"
                ? `gap to ${focusAcronym}`
                : effectiveGapMode === "interval"
                  ? "gap to the car ahead"
                  : "gap to the leader"
              : null
          }
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
        {!hasCars && (
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#636369"
            fontSize={11}
            fontFamily="Inter, sans-serif"
          >
            Press ▶ to start replay
          </text>
        )}
      </svg>

      <TrackControls
        showTrackControls={false}
        overlayBackground={overlayBackground}
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

      {legendOpen && (
        <div className="absolute top-12 right-2 z-30">
          <RingLegend lightMode={lightMode} />
        </div>
      )}

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
          <WeatherPanel weather={weatherOverlay} metricSystem={metricSystem} lightMode={lightMode} />
        )}
      </div>

      {showFocusedHud && hudData && focusDriver !== null && (
        <div className="absolute top-2 left-2 pointer-events-none">
          <FocusedDriverHud
            sample={hudData}
            driver={driverByNumber.get(focusDriver)}
            metricSystem={metricSystem}
            lightMode={lightMode}
          />
        </div>
      )}

      {hasCars && showSectorBox && hasTrackConditionDisplay && (
        <div className="absolute bottom-2 right-2 z-20">
          <SectorChips timingSectorFlags={timingSectorFlags} overlayBackground={overlayBackground} />
        </div>
      )}
    </div>
  );
}

function noop() {}

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
