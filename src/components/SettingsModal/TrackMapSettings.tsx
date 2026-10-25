import { lazy, Suspense, useMemo, type ReactNode } from "react";
import type { Stint, Weather } from "@/api/types";
import { TrackMap } from "@/components/TrackMap/TrackMap";
import { isMap3dAvailable } from "@/components/TrackMap3D/availability";
import { hasCircuitGeometry } from "@/data/circuitGeometry";
import { useLocationChunks } from "@/hooks/useLocationChunks";
import { useDrivers, useLatestMeeting, useSessions } from "@/hooks/useSession";
import { trackEvent } from "@/lib/analytics";
import type { AppSettings, MapViewMode } from "@/stores/settings";
import type { TrackFlagState } from "@/timeline/raceControl";
import { SectionHeader, SettingRow } from "./SettingsPrimitives";

// Only fetched when the 3D preview is shown.
const TrackMap3D = lazy(() =>
  import("@/components/TrackMap3D/TrackMap3D").then((m) => ({ default: m.TrackMap3D })),
);

// Ring preview is lazy too, so the settings chunk doesn't carry it.
const TrackRing = lazy(() =>
  import("@/components/TrackRing/TrackRing").then((m) => ({ default: m.TrackRing })),
);

type Toggle = (key: keyof AppSettings) => (value: boolean) => void;
type MapView = MapViewMode;

/** Latest race weekend's data plus a few staged extras, so every setting is visible. */
function usePreviewData() {
  const latestMeeting = useLatestMeeting();
  const meeting = latestMeeting.data;
  const sessions = useSessions(meeting?.meeting_key ?? null);
  const session = useMemo(() => {
    const rows = sessions.data ?? [];
    return (
      rows.find((row) => row.session_type === "Race") ??
      [...rows].sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start))[0] ??
      null
    );
  }, [sessions.data]);
  const sessionStartMs = session ? Date.parse(session.date_start) : 0;
  const drivers = useDrivers(session?.session_key ?? null);
  const location = useLocationChunks(
    session?.session_key ?? null,
    Number.isFinite(sessionStartMs) ? sessionStartMs : null,
    0,
    0,
    { includeNextChunk: false, prefetchChunks: false },
  );
  const previewDrivers = useMemo(() => drivers.data?.slice(0, 3) ?? [], [drivers.data]);
  const activeCompounds = useMemo(
    () =>
      new Map(
        previewDrivers.map((driver, index) => [
          driver.driver_number,
          {
            compound: (["SOFT", "MEDIUM", "HARD"][index] ?? "UNKNOWN") as Stint["compound"],
            age: 12 + index * 5,
          },
        ]),
      ),
    [previewDrivers],
  );
  const battlingDrivers = useMemo(
    () => new Set(previewDrivers.slice(0, 2).map((driver) => driver.driver_number)),
    [previewDrivers],
  );
  const weather: Weather | null = session
    ? {
        air_temperature: 22,
        date: session.date_start,
        humidity: 58,
        meeting_key: session.meeting_key,
        pressure: 1015,
        rainfall: 0,
        session_key: session.session_key,
        track_temperature: 31,
        wind_direction: 225,
        wind_speed: 2.8,
      }
    : null;
  // A yellow at the first marshal post, so flag settings have something to show.
  const trackFlagState: TrackFlagState = {
    globalFlag: null,
    marshalFlags: { 1: "YELLOW" },
    maxMarshalSector: 3,
    updatedAtMs: sessionStartMs,
  };
  return {
    meeting,
    session,
    sessionStartMs,
    drivers: drivers.data ?? [],
    locationData: location.data,
    previewDrivers,
    activeCompounds,
    battlingDrivers,
    weather,
    trackFlagState,
    unavailable: latestMeeting.isError || sessions.isError,
  };
}

function ViewSwitch({
  view,
  available3d,
  onChange,
}: {
  view: MapView;
  available3d: boolean;
  onChange: (view: MapView) => void;
}) {
  const option = (value: MapView, label: string, disabled = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === value}
      disabled={disabled}
      onClick={() => onChange(value)}
      title={disabled ? "3D needs a Mapbox token and WebGL2" : undefined}
      className={`h-7 px-3 text-[10px] font-black uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-f1red ${
        view === value ? "bg-f1red text-white" : "text-muted hover:bg-panel hover:text-white"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Map view" className="flex border border-panel">
      {option("2d", "2D map")}
      {option("3d", "3D map", !available3d)}
      {option("ring", "Ring")}
    </div>
  );
}

function TrackMapPreview({
  view,
  settings,
  onExit3d,
}: {
  view: MapView;
  settings: AppSettings;
  onExit3d: () => void;
}) {
  const data = usePreviewData();
  const { session } = data;
  const common = session
    ? {
        sessionKey: session.session_key,
        drivers: data.drivers,
        locationData: data.locationData,
        sessionStartMs: data.sessionStartMs,
        sessionGmtOffset: session.gmt_offset,
        circuitKey: session.circuit_key,
        year: session.year,
        focusDriver: null,
        pulseDrivers: data.previewDrivers.slice(0, 1).map((d) => d.driver_number),
        activeCompounds: settings.mapShowCompoundBadges ? data.activeCompounds : undefined,
        battlingDrivers: settings.mapShowBattleRings ? data.battlingDrivers : undefined,
        weatherOverlay: settings.mapShowWeather ? data.weather : null,
        showTrackControls: settings.mapShowTrackControls,
        showFocusedHud: settings.mapShowDriverHud,
        showTrackScreenshot: settings.trackScreenshotPngEnabled,
        showEnhancedVisuals: settings.mapShowEnhancedVisuals,
        raceLeader: settings.mapShowRaceLeader ? (data.previewDrivers[0] ?? null) : null,
      }
    : null;
  const flagState = settings.mapShowSectorFlags ? data.trackFlagState : null;
  const supports3d = session ? hasCircuitGeometry(session.circuit_key, session.year) : true;

  let body: ReactNode;
  if (!common || !session) {
    body = (
      <div className="flex h-full items-center justify-center text-[10px] text-muted">
        Loading latest track…
      </div>
    );
  } else if (view === "ring") {
    body = (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-[10px] text-muted">
            Loading ring view…
          </div>
        }
      >
        <TrackRing
          {...common}
          circuitShortName={session.circuit_short_name}
          trackFlagState={
            settings.mapShowSectorFlags || settings.mapShowSectorBox ? data.trackFlagState : null
          }
          showSectorBox={settings.mapShowSectorBox}
        />
      </Suspense>
    );
  } else if (view === "3d" && supports3d) {
    body = (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-[10px] text-muted">
            Loading 3D map…
          </div>
        }
      >
        <TrackMap3D {...common} trackFlagState={flagState} weather={data.weather} onExit3d={onExit3d} />
      </Suspense>
    );
  } else {
    body = (
      <TrackMap
        {...common}
        circuitShortName={session.circuit_short_name}
        trackFlagState={
          settings.mapShowSectorFlags || settings.mapShowSectorBox ? data.trackFlagState : null
        }
        showSectorBox={settings.mapShowSectorBox}
        showCompass={settings.mapShowCompass}
      />
    );
  }

  return (
    <div className="mt-3 overflow-hidden border border-panel bg-track">
      <div className="flex items-center justify-between gap-3 border-b border-panel px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white">
            Live preview{view === "3d" ? " · 3D" : view === "ring" ? " · Ring" : ""}
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            {data.meeting ? `${data.meeting.meeting_name} track map` : "Loading latest race weekend"}
            {view === "3d" && session && !supports3d ? " · no 3D for this circuit, showing 2D" : ""}
          </div>
        </div>
        {data.unavailable && (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Preview unavailable
          </span>
        )}
      </div>
      {/* Fixed height, full width: an aspect ratio plus max-height would also
          cap the width, leaving the 3D canvas narrower than the panel. */}
      <div className="relative h-[38dvh] min-h-40 max-h-[30rem] w-full">{body}</div>
    </div>
  );
}

/**
 * Track map settings: pick the 2D or 3D map (the live preview follows), then
 * only the settings that apply to that map, grouped by topic.
 */
export function TrackMapSettings({
  settings,
  toggle,
  setViewMode,
}: {
  settings: AppSettings;
  toggle: Toggle;
  setViewMode: (mode: MapViewMode) => void;
}) {
  const available3d = isMap3dAvailable();
  const view: MapView =
    settings.mapViewMode === "3d" && !available3d ? "2d" : settings.mapViewMode;
  const is3d = view === "3d";
  const isRing = view === "ring";
  const is2d = view === "2d";
  const setView = (next: MapView) => {
    if (next === view) return;
    trackEvent("trackmap_view_mode_changed", { mode: next, source: "settings" });
    setViewMode(next);
  };

  const row = (
    key: keyof AppSettings,
    label: string,
    description: string,
    extra: { disabled?: boolean } = {},
  ) => (
    <SettingRow
      label={label}
      description={description}
      checked={Boolean(settings[key])}
      onChange={toggle(key)}
      disabled={extra.disabled}
    />
  );

  return (
    <>
      <div className="shrink-0">
        <div className="flex items-end justify-between gap-3">
          <SectionHeader>Track Map</SectionHeader>
          <ViewSwitch view={view} available3d={available3d} onChange={setView} />
        </div>
        {!available3d && (
          <div className="pt-2 text-[10px] text-muted">
            3D map isn't available here: it needs a Mapbox token and a browser with WebGL2.
          </div>
        )}
        <TrackMapPreview view={view} settings={settings} onExit3d={() => setView("2d")} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {isRing && (
          <>
            <SectionHeader>Ring</SectionHeader>
            {row(
              "mapRingTimeScale",
              "Space by lap time",
              "A full turn is a reference lap: gaps read as angles and slow corners take more of the circle. Off: spaced by distance",
            )}
            {row("mapRingReverse", "Anticlockwise", "Run the lap anticlockwise round the dial")}
            {row(
              "mapRingShowPitWindowOutcomes",
              "Show pit window outcomes",
              "Name the drivers who would pass or fall behind if the focused driver pitted now (races)",
            )}
          </>
        )}
        <SectionHeader>Cars</SectionHeader>
        {row("mapShowDriverAcronym", "Driver acronym labels", "Show 3-letter driver labels next to cars")}
        {row("mapShowDriverNumberInside", "Driver number inside dot", "Show the driver number centred in each car marker")}
        {row("mapShowCompoundBadges", "Tyre compound badges", "Compound colour on each car marker")}
        {row("mapShowBattleRings", "DRS battle rings", "Highlight drivers within 1 s of the car ahead")}
        {is3d &&
          row(
            "mapView3dCarModels",
            "3D car models",
            "Swap car markers for 3D cars when zoomed in. Off: keep the markers at every zoom",
          )}
        {is3d &&
          row(
            "mapView3dSpeedTrail",
            "Speed-coloured trail",
            "Colour the focused car's trail by speed (blue slow → red fast). Off: team colour",
          )}
        {is3d &&
          row(
            "mapView3dBattleGaps",
            "Battle gap ribbons",
            "Mark the track between cars within 1 s and show the gap (races). Focused car: its battles only",
          )}
        {row("mapShowDriverHud", "Focused driver HUD", "Speed, gear and throttle for the selected driver")}
        {!isRing && row("mapShowPitRejoin", "Pit rejoin projection", "Where the focused driver would rejoin if they pitted now (races)")}
        {row("mapShowRaceLeader", "Race leader badge", "Show the P1 race leader badge with headshot")}

        <SectionHeader>Flags & Sectors</SectionHeader>
        {row("mapShowSectorFlags", "Sector flag colouring", "Tint the track where yellow, red and safety car flags are out")}
        {is3d &&
          row(
            "mapView3dFlagColors",
            "Flag colours on track",
            settings.mapShowSectorFlags
              ? "Paint flags onto the 3D track surface: flagged marshal posts and timing sectors"
              : "Turn on Sector flag colouring to use this",
            { disabled: !settings.mapShowSectorFlags },
          )}
        {is3d &&
          row(
            "mapView3dSectorRibbon",
            "Sector condition ribbon",
            "Band along each timing sector: green when clear, the flag colour when flagged",
          )}
        {!is3d && row("mapShowSectorBox", "Sector status box", "S1/S2/S3 flag chips next to the compass")}
        {is2d &&
          row(
            "mapShowMarshalHeatmap",
            "Marshal sector heatmap",
            "Paint every marshal post's stretch as a coloured segment (S1 red / S2 yellow / S3 blue)",
          )}

        <SectionHeader>Track Detail</SectionHeader>
        {!isRing &&
          row(
            "mapShowEnhancedVisuals",
            "Enhanced track visuals",
            "Start/finish line, sector markers, direction arrows, lap delta and braking hotspots",
          )}
        {row(
          "mapShowCornerNumbers",
          "Corner numbers",
          isRing ? "Corner numbers inside the ring (ticks are always shown)" : "Corner numbers next to the track",
        )}
        {!isRing && row("mapShowElevation", "Elevation heatmap", "Colour the track by altitude (blue = low, yellow = high)")}
        {is3d && row("mapView3dBuildings", "3D buildings and trees", "Buildings, trees and landmarks around the circuit")}
        {is3d &&
          row(
            "mapView3dTerrain",
            "Terrain",
            "Hills and elevation (e.g. Spa, COTA). Street-level detail looks softer with it on",
          )}

        {is3d && (
          <>
            <SectionHeader>Light & Weather</SectionHeader>
            {row(
              "mapView3dSessionLighting",
              "Session time-of-day lighting",
              "Light the map like the circuit's local time at that moment (night races look like night). Off: follow the app's light/dark theme",
            )}
            {row("mapView3dWeatherEffects", "Weather effects", "Rain on the map when it rained at the circuit at that moment")}
          </>
        )}

        <SectionHeader>Overlays & Controls</SectionHeader>
        {row("mapShowWeather", "Track weather", "Weather panel on the map")}
        {row("mapShowClock", "Track time clock", "The circuit's local time and yours")}
        {!isRing &&
          row(
            "mapShowTrackControls",
            "Track controls",
            is3d ? "Recenter and camera mode buttons" : "Rotate, zoom and fit-track buttons",
          )}
        {is2d && row("mapShowCompass", "Compass overlay", "North indicator next to the track controls")}
        {row("trackScreenshotPngEnabled", "PNG track snapshot", "Button to download the map as an image")}

        <SectionHeader>Sound</SectionHeader>
        {row("mapStartLightsSound", "Start light sounds", "Beep as each race start light comes on")}
      </div>
    </>
  );
}
