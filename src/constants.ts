// Central home for tunable constants and magic numbers used across the app.
// Grouped by domain. Prefer importing from here over re-declaring literals.

import { TOKEN_HEX } from "./designTokens";

// ── Seasons ───────────────────────────────────────────────────────────────────
// OpenF1 coverage starts in 2023. Generates a descending list up to the current
// year so the picker stays current without manual updates.
const OPENF1_START_YEAR = 2023;
const _currentYear = new Date().getFullYear();
export const YEARS = Array.from(
  { length: _currentYear - OPENF1_START_YEAR + 1 },
  (_, i) => _currentYear - i,
) as number[];
export const DEFAULT_YEAR = YEARS[0];

// ── Playback ────────────────────────────────────────────────────────────────--
export const SPEEDS = [1, 2, 4, 8, 16] as const;
// Diameter of the playback scrubber's thumb (see index.css). Its centre stops
// half this inside each end of the track, so markers are laid out on that span.
export const SCRUBBER_THUMB_PX = 16;
// Cap a single RAF step so a throttled/backgrounded tab can't jump the playhead
// across a whole location chunk when it refocuses (real ms, before speed scaling).
export const MAX_FRAME_STEP_MS = 250;

// ── Location replay chunks ──────────────────────────────────────────────────--
// 5-minute windows keep each fetch ≤ ~22k rows (20 drivers × 3.7 Hz × 300 s).
export const CHUNK_MS = 5 * 60 * 1000;
// Location endpoint can return very large payloads; use smaller chunking there
// to reduce per-request JSON parse/indexing spikes on fast playback.
export const LOCATION_CHUNK_MS = 2 * 60 * 1000;

// ── Live session detection / polling ───────────────────────────────────────--
// Buffer so "live" activates just before lights-out and lingers past the flag.
export const LIVE_BUFFER_MS = 30 * 60 * 1000;
// Refetch intervals for live data. Fast cadence is for timing-critical panels
// (positions/intervals/laps), while slower cadence reduces pressure for feeds
// that change less often (weather/race control/team radio/overtakes).
export const LIVE_POLL_FAST_MS = 20_000;
export const LIVE_POLL_SLOW_MS = 60_000;
// Minimum real-world gap between URL `history.replaceState()` calls from the
// playhead sync. At high playback speeds `t` can cross a new whole second
// many times per real second, so this is throttled by wall-clock time (not
// playhead time) to stay well under the browser's ~100-calls/10s limit.
export const URL_SYNC_THROTTLE_MS = 1_000;
export const CURRENT_SEASON_STALE_MS = 6 * 60 * 60 * 1000;
// How often the season schedule re-evaluates live/next badges and countdowns.
export const SCHEDULE_CLOCK_TICK_MS = 30_000;
// Highlights dialog: fall back to the YouTube link preview when the embedded
// player hasn't reported ready by then (script blocked, slow network).
export const HIGHLIGHTS_PLAYER_TIMEOUT_MS = 12_000;
// Public OpenF1 homepage, linked as the data-source attribution.
export const OPENF1_SITE_URL = "https://openf1.org/";
// OpenF1 MQTT-over-WebSocket endpoint for browser clients.
export const OPENF1_MQTT_WSS_URL = "wss://mqtt.openf1.org:8084/mqtt";
// Grace period for reconnect attempts before giving up the current connection attempt.
export const OPENF1_MQTT_CONNECT_TIMEOUT_MS = 10_000;
// Keep this modest: MQTT updates are high frequency and query caches already hold
// full-session data from REST. These caps protect memory in long live sessions.
export const LIVE_MQTT_MAX_ROWS = 4_000;

// ── Track map (SVG) ─────────────────────────────────────────────────────────--
export const TRACK_SVG_W = 600;
export const TRACK_SVG_H = 400;
export const TRACK_SVG_PAD = 24;
export const TRACK_BACKGROUND_GRID_SIZE = 40;
export const TRACK_BACKGROUND_GLOW_OPACITY = 0.07;
export const TRACK_BACKGROUND_GLOW_OPACITY_LIGHT = 0.1;
export const TRACK_BACKGROUND_LINE_OPACITY = 0.07;
export const TRACK_BACKGROUND_LINE_OPACITY_LIGHT = 0.14;
/** Mouse-wheel zoom sensitivity and normalization for the 2D track map. */
export const TRACK_WHEEL_ZOOM_PER_PIXEL = 0.002;
export const TRACK_WHEEL_LINE_PIXELS = 16;
export const TRACK_WHEEL_MAX_DELTA = 200;
/** Horizontal right-drag sensitivity for 2D track rotation. */
export const TRACK_DRAG_ROTATION_DEG_PER_PIXEL = 0.5;
/** Scale of racing-driver map and ring dots and their numbers in the pits. */
export const TRACK_PIT_CAR_SCALE = 0.7;
export const TRACK_PIT_ACCESS_MARKER_RADIUS = 3.5;
/** Pit access signal halo radius, relative to the illuminated lamp. */
export const TRACK_PIT_ACCESS_GLOW_SCALE = 2.7;
/** Dimensions of the start-light-style pit-exit signal in SVG units / map pixels. */
export const TRACK_PIT_EXIT_LIGHT_RADIUS = 3;
export const TRACK_PIT_EXIT_LIGHT_WIDTH = 11;
export const TRACK_PIT_EXIT_LIGHT_HEIGHT = 11;
export const SESSION_SIMULATION_CARS = 12;
export const SESSION_SIMULATION_LAP_SECONDS = 32;
export const SESSION_SIMULATION_LAP_STEP_SECONDS = 1.2;
// OpenF1 / circuit-geometry x,y are decimetres.
export const F1_UNITS_PER_METRE = 10;
// Schedule card circuit thumbnail (SVG units) and how much of the lap the
// direction arrow covers.
export const SCHEDULE_OUTLINE_W = 120;
export const SCHEDULE_OUTLINE_H = 80;
export const SCHEDULE_OUTLINE_PAD = 6;
export const SCHEDULE_OUTLINE_ARROW_FRACTION = 0.06;
// Schedule world map (equirectangular degrees, see utils/worldMap.ts). The
// latitude crop drops the polar regions no circuit is near.
export const SCHEDULE_MAP_MAX_LAT = 75;
export const SCHEDULE_MAP_MIN_LAT = -56;
// Closest zoom: the narrowest view, in degrees of longitude.
export const SCHEDULE_MAP_MIN_VIEW_DEG = 6;
// Screen margin around the circuits when fitting the view: clears the
// markers themselves and the zoom buttons.
export const SCHEDULE_MAP_FIT_PAD_PX = 48;
// Markers closer than this on screen merge into one cluster bubble.
export const SCHEDULE_MAP_CLUSTER_PX = 26;
export const SCHEDULE_MAP_ZOOM_STEP = 1.6;
// "Current weekend" zooms to at most this view width (degrees of longitude).
export const SCHEDULE_MAP_FOCUS_VIEW_DEG = 40;
// Mouse-wheel zoom per 100 px of scroll delta.
export const SCHEDULE_MAP_WHEEL_ZOOM = 1.25;
export const SCHEDULE_MAP_ANIM_MS = 450;
// Travel legs bow sideways by this fraction of their length (flight-path look).
export const SCHEDULE_MAP_ARC_BOW = 0.18;
// Pointer movement (px) before a press on the map becomes a pan.
export const SCHEDULE_MAP_DRAG_THRESHOLD_PX = 4;
// Slightly enlarge the fit so the track uses the available map area while
// leaving enough room for the ribbon, markers, and labels.
export const TRACK_FIT_ZOOM = 1.15;
// ── Ring view (circular lap-progress tracker) ───────────────────────────────--
/** Ring view SVG viewport; the ring is centred in it. */
export const RING_SVG_W = 460;
export const RING_SVG_H = 400;
/** Radius of the track ring (SVG units). */
export const RING_RADIUS = 128;
/** Mouse-wheel zoom limits for the ring view, matching the 2D map. */
export const RING_ZOOM_MIN = 0.6;
export const RING_ZOOM_MAX = 3;
export const RING_BACKGROUND_OFFSETS = [20, 40] as const;
export const RING_BACKGROUND_TICK_COUNT = 48;
export const RING_BACKGROUND_MAJOR_TICK_EVERY = 6;
export const RING_BACKGROUND_TICK_INSET = 5;
export const RING_BACKGROUND_TICK_LENGTH = 4;
export const RING_BACKGROUND_MAJOR_TICK_LENGTH = 8;
export const RING_BACKGROUND_TICK_OPACITY = 0.18;
export const RING_BACKGROUND_MAJOR_TICK_OPACITY = 0.32;
export const RING_BACKGROUND_TICK_OPACITY_LIGHT = 0.28;
export const RING_BACKGROUND_MAJOR_TICK_OPACITY_LIGHT = 0.44;
export const RING_BACKGROUND_START_TICK_OPACITY = 0.72;
/** Radius of the inner pit-lane arc. */
export const RING_PIT_RADIUS = 92;
/** Radius at which driver labels sit, outside the ring. */
export const RING_LABEL_RADIUS = 168;
/** Minimum spacing between ring labels, as a fraction of the lap. */
export const RING_LABEL_MIN_GAP = 0.036;
/** Nearest cars on either side of the inspected driver emphasized in ring view. */
export const RING_NEARBY_CARS_PER_SIDE = 2;
/** Time-based ring: laps within this share of the fastest form the reference lap. */
export const RING_REF_LAP_SPREAD = 0.07;
/** Time-based ring: distance grid points in the reference lap profile. */
export const RING_REF_LAP_GRID = 240;
/** Time-based ring: plausible reference lap duration range (ms). */
export const RING_REF_LAP_MIN_MS = 40_000;
export const RING_REF_LAP_MAX_MS = 240_000;
/** Time-based ring: how much location history to scan for full laps (ms). */
export const RING_REF_TRACE_WINDOW_MS = 300_000;
/** Time-based ring: how often the reference lap is rebuilt (playhead ms). */
export const RING_REF_REFRESH_MS = 20_000;
/** Time-based ring: fastest session laps (so far) combined into the dial's shape. */
export const RING_REF_POOL_MAX_LAPS = 40;
/** Time-based ring: a lap-time pace this much slower (safety car) doesn't replace a recent one… */
export const RING_REF_PACE_MAX_SLOWDOWN = 1.15;
/** …measured within this much playhead (ms). */
export const RING_REF_PACE_HOLD_MS = 10 * 60_000;
/** Outline segments searched either side of a car's last match before a full scan. */
export const RING_SEARCH_WINDOW = 24;
/** Metres off the centerline at which a car counts as off the racing line (pit/garage). */
export const RING_OFF_TRACK_M = 25;
/** Ring pit window: how far back to look for when a car in the pits left the track (ms); longer reads as a garage stop. */
export const RING_PIT_ENTRY_LOOKBACK_MS = 120_000;
/** Pit window band (ring, 2D and 3D maps): how far the focused car would fall if it pitted now. */
export const PIT_WINDOW_COLOR = "#9b4dca";
/** Pit window ticks for the pit loss under the other track conditions (SC, VSC, green). */
export const PIT_MARKER_COLOR = "#ff8a1f";
// Duration (ms) to show the race leader notification badge on the track map after a lead change.
export const RACE_LEADER_NOTIFICATION_MS = 5_000;
// Lap used to derive the track outline (a clean early lap; falls back to lap 3, then any).
export const TRACK_OUTLINE_LAP = 2;

// Fallback session duration when date_end is missing (2 hours).
export const DEFAULT_SESSION_MS = 7_200_000;

// ── Weather history ──────────────────────────────────────────────────────────
export const WEATHER_CHART_HEIGHT = 200;

// ── Special track vehicles ──────────────────────────────────────────────────--
// OpenF1 reports the safety cars and the medical car through the `location`
// feed using reserved driver numbers. F1 runs two safety cars that alternate
// between events, so both numbers must be recognised; only the deployed one
// reports real coordinates.
export const SAFETY_CAR_NUMBERS: ReadonlySet<number> = new Set([241, 242]);
export const MEDICAL_CAR_NUMBER = 243;

// ── Track flag colours ──────────────────────────────────────────────────────--
// Single source of truth for every flag painter on the track map. Keyed by the
// normalized flag key from `toFlagKey`. A flag absent from this map is not
// painted, which is why CHEQUERED, BLUE and BLACK_AND_WHITE are omitted.
export const FLAG_COLORS: Record<string, string> = {
  YELLOW: TOKEN_HEX.yellow,
  DOUBLE_YELLOW: TOKEN_HEX.yellow,
  RED: TOKEN_HEX.f1red,
  SAFETY_CAR: TOKEN_HEX.orange,
  VIRTUAL_SC: TOKEN_HEX.orange,
  VIRTUAL_SAFETY_CAR: TOKEN_HEX.orange,
  GREEN: TOKEN_HEX.green,
  CLEAR: TOKEN_HEX.green,
};

// ── Track map sector colours ────────────────────────────────────────────────--
export const SECTOR_COLORS: Record<1 | 2 | 3, string> = {
  1: TOKEN_HEX.orange,
  2: "#7cb342",
  3: "#b71c1c",
};

// ── Track map follow-cam (zoom dimensions in SVG units) ─────────────────────--
// 200 × 134 gives ≈3× zoom on the 600 × 400 viewport. Tune here to adjust depth.
export const FOLLOW_ZOOM_W = 200;
export const FOLLOW_ZOOM_H = 134;

// ── 3D track map (Mapbox) ───────────────────────────────────────────────────--
export const MAP3D_STYLE_URL = "mapbox://styles/mapbox/standard";
/** True-scale elevation when the 3D terrain setting is on. */
export const MAP3D_TERRAIN_EXAGGERATION = 1;
/** Drawn width of the track ribbon / flag band, in metres on the ground. */
export const MAP3D_TRACK_WIDTH_M = 15;
/** Track surface geometry (metres): asphalt half-width, verge, pit lane, kerbs. */
export const MAP3D_TRACK_HALF_WIDTH_M = 7.5;
export const MAP3D_VERGE_M = 2.4;
/** The sector condition ribbon shows this far beyond each asphalt edge (2D's 20-unit ribbon). */
export const MAP3D_SECTOR_RIBBON_M = 4;
export const MAP3D_PIT_LANE_HALF_WIDTH_M = 3;
export const MAP3D_KERB_WIDTH_M = 2.5;
export const MAP3D_KERB_BLOCK_M = 2;
/** Kerb base + stripe colours (red/white). */
export const MAP3D_KERB_COLORS: readonly [string, string] = [
  "#f2f2f2",
  "#e2231a",
];
/**
 * Run-off on the outside of each corner: band width beyond the verge, and how
 * far it reaches before and after the corner.
 */
export const MAP3D_RUNOFF_M = 18;
export const MAP3D_RUNOFF_EXTEND_M = 30;
export type RunoffSurface = "gravel" | "sand" | "tarmac";
/**
 * Run-off colours per surface and Standard light preset, dry and wet. Each
 * circuit's surface comes from src/data/circuit-runoff.json (`getRunoffStyle`).
 */
export const MAP3D_RUNOFF_PALETTE = {
  gravel: {
    dawn: { dry: "#b9a07e", wet: "#8f7b60" },
    day: { dry: "#c8b58e", wet: "#9e8d6c" },
    dusk: { dry: "#a48c74", wet: "#7d6a57" },
    night: { dry: "#5e5a52", wet: "#46433d" },
  },
  sand: {
    dawn: { dry: "#d8c49a", wet: "#a8966f" },
    day: { dry: "#e8d8ab", wet: "#bcaa80" },
    dusk: { dry: "#c1aa8a", wet: "#907e64" },
    night: { dry: "#6d6858", wet: "#4e4a40" },
  },
  // Lighter than the racing surface so the track edge still reads.
  tarmac: {
    dawn: { dry: "#5c606a", wet: "#43464f" },
    day: { dry: "#6e727b", wet: "#4f535b" },
    dusk: { dry: "#555862", wet: "#3d4049" },
    night: { dry: "#40444e", wet: "#2e3139" },
  },
} as const satisfies Record<
  RunoffSurface,
  Record<"dawn" | "day" | "dusk" | "night", { dry: string; wet: string }>
>;
/** Painted white track-limit line along each asphalt edge (width, colour). */
export const MAP3D_EDGE_LINE_M = 0.4;
export const MAP3D_EDGE_LINE_COLOR = "#f4f4f4";
/** Chequered start grid: columns across the track × rows along it, total depth. */
export const MAP3D_START_GRID_COLUMNS = 6;
export const MAP3D_START_GRID_ROWS = 3;
export const MAP3D_START_GRID_DEPTH_M = 7.5;
/**
 * Grid slots behind the start line: count, distance of pole behind the line,
 * spacing between consecutive (staggered) slots, and the white bracket's
 * width, line thickness and leg length.
 */
export const MAP3D_GRID_SLOTS = 22;
export const MAP3D_GRID_FIRST_SLOT_M = 8;
export const MAP3D_GRID_SLOT_SPACING_M = 8;
export const MAP3D_GRID_SLOT_WIDTH_M = 3;
export const MAP3D_GRID_SLOT_LINE_M = 0.35;
export const MAP3D_GRID_SLOT_LEG_M = 1.8;
/** Grid slots stop where the track behind the line has turned more than this. */
export const MAP3D_GRID_MAX_BEND_DEG = 12;
/** Mown grass beyond the verge (permanent circuits) and its stripe length. */
export const MAP3D_GRASS_M = 10;
export const MAP3D_GRASS_STRIPE_M = 10;
/**
 * Trackside 3D objects: barrier distance beyond the verge (grass stretches,
 * street-circuit walls, and beyond the gravel), how far it sweeps between
 * those, and its thickness / height; catch fence above it.
 */
export const MAP3D_BARRIER_GAP_M = 8;
export const MAP3D_WALL_GAP_M = 0.8;
export const MAP3D_BARRIER_RUNOFF_GAP_M = 1.5;
export const MAP3D_BARRIER_RAMP_M = 25;
export const MAP3D_BARRIER_THICKNESS_M = 0.7;
export const MAP3D_BARRIER_HEIGHT_M = 1.1;
export const MAP3D_WALL_HEIGHT_M = 1.4;
export const MAP3D_FENCE_HEIGHT_M = 4.5;
/** Barrier pieces shorter than this (between clipped stretches) are dropped. */
export const MAP3D_BARRIER_MIN_RUN_M = 10;
/** Tyre-wall colour blocks behind the gravel. */
export const MAP3D_TYRE_WALL_BLOCK_M = 3;
/** Track barriers keep this far from the pit-lane centerline (the pit wall takes over). */
export const MAP3D_BARRIER_PIT_CLEAR_M = 11;
/** Pit wall only where the pit lane runs within this distance of the track. */
export const MAP3D_PIT_WALL_MAX_GAP_M = 60;
/** Start-light gantry: beam height (underside) and depth along the track. */
export const MAP3D_GANTRY_CLEARANCE_M = 6.5;
export const MAP3D_GANTRY_BEAM_M = 1.4;
export const MAP3D_TRACKSIDE_COLORS = {
  wall: "#dfe1e6",
  tyres: ["#d71920", "#f4f4f4"],
  fence: "#30353e",
  gantry: "#262a31",
  lights: "#e10600",
} as const;
/** Trackside objects fade in around this zoom (they're under a pixel further out). */
export const MAP3D_TRACKSIDE_MIN_ZOOM = 14.5;
/** Below this zoom the track draws as lines; above it as real-width polygons. */
export const MAP3D_SURFACE_MIN_ZOOM = 13.5;
/**
 * Asphalt / verge / grass colours per Standard light preset (run-off: MAP3D_RUNOFF_PALETTE). Emissive
 * strength rises at night so the surface still reads without glowing by day.
 */
export const MAP3D_TRACK_PALETTE = {
  dawn: {
    surface: "#3f434e",
    casing: "#ffd9a8",
    casingOpacity: 0.45,
    emissive: 0.3,
    grass: "#86b376",
    grassStripe: "#93c083",
  },
  day: {
    surface: "#4a4d55",
    casing: "#ffffff",
    casingOpacity: 0.6,
    emissive: 0.1,
    grass: "#8cc576",
    grassStripe: "#9bd285",
  },
  dusk: {
    surface: "#3a3d47",
    casing: "#ffb488",
    casingOpacity: 0.45,
    emissive: 0.35,
    grass: "#6d9264",
    grassStripe: "#799f6f",
  },
  night: {
    surface: "#2f333d",
    casing: "#9aa3b5",
    casingOpacity: 0.5,
    emissive: 0.6,
    grass: "#2b3f2e",
    grassStripe: "#324835",
  },
} as const;
/**
 * Asphalt while it rains: darker, with more emissive so floodlights read as
 * a wet sheen at night (run-off darkens via MAP3D_RUNOFF_PALETTE). Verge and kerbs keep the dry
 * palette.
 */
export const MAP3D_TRACK_WET_PALETTE = {
  dawn: { surface: "#2c2f38", emissive: 0.35 },
  day: { surface: "#33363d", emissive: 0.15 },
  dusk: { surface: "#282a33", emissive: 0.4 },
  night: { surface: "#22252d", emissive: 0.75 },
} as const;
/**
 * Rain haze (Mapbox fog) per light preset. Only applied while raining; the
 * Standard style's own fog is restored when it dries up. Range is in km-ish
 * fog units: [start, end] moves closer as rain gets heavier.
 */
export const MAP3D_RAIN_FOG = {
  dawn: { color: "#8f8c95", high: "#5c5b6b", space: "#2a2a35" },
  day: { color: "#a3abb5", high: "#717c8a", space: "#4a5361" },
  dusk: { color: "#7f7a86", high: "#4d4a5a", space: "#1f1d28" },
  night: { color: "#1c2028", high: "#0e1118", space: "#05070b" },
} as const;
export const MAP3D_RAIN_FOG_RANGE_LIGHT: readonly [number, number] = [0.6, 6];
export const MAP3D_RAIN_FOG_RANGE_HEAVY: readonly [number, number] = [0.2, 2.5];
export const MAP3D_FLAG_WIDTH_M = 26;
export const MAP3D_OVERVIEW_PITCH = 50;
export const MAP3D_FOLLOW_PITCH = 62;
export const MAP3D_FOLLOW_ZOOM = 17.5;
/** Per-frame budget for the 3D map's own work (see ?debug=map3d). */
export const MAP3D_FRAME_BUDGET_MS = 4;
/**
 * Cars are re-sent as soon as the previous update is on screen (see
 * TrackMap3D/carSync.ts); an update with no tile event (e.g. no car in view)
 * is given up on after this long.
 */
export const MAP3D_CAR_SYNC_TIMEOUT_MS = 120;
/** Per-frame lerp factors for the follow camera (higher = snappier). */
export const MAP3D_FOLLOW_CENTER_ALPHA = 0.3;
export const MAP3D_FOLLOW_BEARING_ALPHA = 0.08;
/** Heading is taken from the car's position this long ago → now. */
export const MAP3D_HEADING_LOOKBACK_MS = 400;
/** Chase camera: metres behind / above the car, and how far ahead it looks. */
export const MAP3D_CHASE_BACK_M = 45;
export const MAP3D_CHASE_UP_M = 14;
export const MAP3D_CHASE_AHEAD_M = 15;
/** Per-frame smoothing of the chase camera's eye position. */
export const MAP3D_CHASE_ALPHA = 0.18;
/**
 * Onboard (T-cam) camera: just above and behind the car, looking far down the
 * road. Tighter smoothing than chase, and a heading centred on the camera
 * instant (± this lookaround) so it points into corners instead of lagging.
 */
export const MAP3D_ONBOARD_BACK_M = 7;
export const MAP3D_ONBOARD_UP_M = 3;
export const MAP3D_ONBOARD_AHEAD_M = 45;
export const MAP3D_ONBOARD_ALPHA = 0.45;
export const MAP3D_ONBOARD_HEADING_MS = 250;
/** Orbit camera turn rate (degrees of bearing per real second). */
export const MAP3D_ORBIT_DEG_PER_S = 6;
/**
 * Auto-director ("TV" camera, timeline/director.ts). Shot lengths are real
 * (wall-clock) ms so fast playback doesn't strobe; cue windows are session ms.
 */
export const DIRECTOR_MIN_SHOT_MS = 4_000;
export const DIRECTOR_MAX_SHOT_MS = 15_000;
/** Cut to an overtake this long before it is recorded, and stay a bit after. */
export const DIRECTOR_OVERTAKE_LEAD_MS = 10_000;
export const DIRECTOR_OVERTAKE_AFTER_MS = 4_000;
/** Pit cue: from just before pit entry until shortly after the lane exit. */
export const DIRECTOR_PIT_LEAD_MS = 3_000;
export const DIRECTOR_PIT_AFTER_MS = 3_000;
/** Lane time assumed when OpenF1 has none for a stop. */
export const DIRECTOR_PIT_FALLBACK_LANE_MS = 22_000;
/** 3D car models appear from this zoom; below it the 2D-style icons show. */
export const MAP3D_MODEL_MIN_ZOOM = 15;
/**
 * Model scale by zoom: the CC0 model is ~2.56 m long, so 5 ≈ a 13 m car
 * (exaggerated to read at follow zoom), easing to ~true size (2.2 ≈ 5.6 m)
 * by chase-camera zoom.
 */
export const MAP3D_MODEL_SCALE_FAR = 5;
export const MAP3D_MODEL_SCALE_NEAR = 2.2;
export const MAP3D_MODEL_NEAR_ZOOM = 18.5;
/**
 * Degrees added to a car's compass heading to point the model's nose forward.
 * The model's nose is +Z (low front wing; the tall rear wing is at -Z), which
 * Mapbox renders facing backwards at rotation 0 — verified from chase views
 * heading east, south and west.
 */
export const MAP3D_MODEL_HEADING_OFFSET = 180;
/**
 * Soft ground shadow under the 2D-style car icons (the 3D models cast their
 * own): radius as a multiple of the dot radius, blur, opacity, and how far it
 * sits below the icon on screen (2D SVG units) so the icon reads as lifted.
 */
export const MAP3D_CAR_SHADOW_RADIUS = 1.25;
export const MAP3D_CAR_SHADOW_BLUR = 0.7;
export const MAP3D_CAR_SHADOW_OPACITY = 0.45;
export const MAP3D_CAR_SHADOW_DROP = 1.6;
/** Length and sampling of the focused car's trail on the 3D map. */
export const MAP3D_TRAIL_MS = 8_000;
export const MAP3D_TRAIL_STEP_MS = 200;
/**
 * Battle gap ribbons: centerline from chaser to the car ahead, gold like the
 * battle rings. Longer ribbons than this are dropped (pit stops, stale data).
 */
export const MAP3D_GAP_RIBBON_COLOR = "#ffd700";
export const MAP3D_GAP_RIBBON_MAX_M = 250;
/** TV director: each cut fades in from black over this long (skipped for reduced motion). */
export const MAP3D_DIRECTOR_FADE_MS = 250;
/** Speed-coloured trail: car-data gaps longer than this show the team colour. */
export const MAP3D_TRAIL_SPEED_MAX_GAP_MS = 1_000;
/** Sun elevation (°) at or above which the 3D map uses the "day" preset. */
export const MAP3D_SUN_DAY_DEG = 6;
/** Sun elevation (°) at or below which it uses "night" (civil twilight ends ≈ -6°). */
export const MAP3D_SUN_NIGHT_DEG = -6;

// ── Tyre compounds ──────────────────────────────────────────────────────────--
// The only definition of compound colours: every badge, chart and map marker
// reads it (the 3D map and canvas need literal hex, not CSS variables).
export const COMPOUND_COLORS = {
  SOFT: TOKEN_HEX.f1red,
  MEDIUM: "#ffd700",
  HARD: "#f0f0f0",
  INTERMEDIATE: TOKEN_HEX.green,
  WET: TOKEN_HEX.blue,
  UNKNOWN: TOKEN_HEX.faint,
} as const;
/** HARD's white disappears on a light background; light mode draws it grey. */
export const COMPOUND_HARD_LIGHT_COLOR = "#6b7280";
export const COMPOUND_LETTERS = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
  INTERMEDIATE: "I",
  WET: "W",
  UNKNOWN: "?",
} as const;

// ── Tracker lap / gap charts ────────────────────────────────────────────────--
// Chart margins (px); the right margin is the gutter for the driver end labels.
export const RACE_CHART_MARGIN = { top: 10, right: 44, bottom: 4, left: 0 } as const;
export const RACE_CHART_X_AXIS_HEIGHT = 20;
// Closest two driver end labels may sit (px) before they are spread apart.
export const CHART_END_LABEL_GAP_PX = 11;
// Recharts 3 layers by zIndex (lines 400, axes 500): the All-mode veil over
// future laps sits above the lines, the current-lap line above the veil.
export const RACE_CHART_VEIL_Z = 450;
export const RACE_CHART_NOW_Z = 460;
// Gap chart: Y axis cap (s) so lapped cars don't flatten the battle zone, the
// tick steps it picks from (each divides the cap), how many ticks it aims for,
// and how many cars the "Top N" filter keeps.
export const GAP_CHART_MAX_SEC = 120;
export const GAP_CHART_AXIS_STEPS_SEC = [1, 2, 5, 10, 15, 30] as const;
export const GAP_CHART_MAX_TICKS = 6;
// Time-axis fallback (no lap starts): interval rows are bucketed to this so
// every driver shares the same x values.
export const GAP_CHART_TIME_BUCKET_MS = 5_000;
export const GAP_CHART_TOP_N = 10;

// ── Championship points ─────────────────────────────────────────────────────--
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
// Bonus point for the fastest lap (top-10 finishers only), awarded 2019–2024.
export const FASTEST_LAP_POINT = 1;
export const FASTEST_LAP_POINT_LAST_YEAR = 2024;
// Lines drawn by default in the points progression chart before "show all".
export const PROGRESSION_DEFAULT_LINES = 10;

// ── Race finish detection ───────────────────────────────────────────────────--
// The race-control CHEQUERED timestamp sits within a few seconds either side of
// the leader's actual line crossing (2024 races: −2.8 s … +0.8 s). Search this
// window around the flag for the leader's finishing crossing.
export const CHEQUERED_LEADER_SEARCH_MS = 15_000;

// ── Race start lights ───────────────────────────────────────────────────────--
// Five red lights come on one by one, hold, then all go out together at the
// start. Tune the interval/hold to match the start-light sound's pacing.
export const START_LIGHT_COUNT = 5;
export const START_LIGHT_INTERVAL_MS = 1_000;
// Time between the last light coming on and lights out.
export const START_LIGHTS_HOLD_MS = 1_000;
// From the first light coming on to lights out.
export const START_LIGHTS_SEQUENCE_MS =
  (START_LIGHT_COUNT - 1) * START_LIGHT_INTERVAL_MS + START_LIGHTS_HOLD_MS;
// "Get ready" lead-in shown before the first light comes on.
export const START_LIGHTS_LEAD_IN_MS = 700;
// How long "Lights Out" stays up after the start.
export const LIGHTS_OUT_NOTICE_MS = 3_500;
// Standing restart after a red flag: race control only announces it, so lights
// out is read from the leader's car data — the moment it pulls away after
// standing still on the grid for at least STANDING_RESTART_MIN_STOP_MS.
export const STANDING_RESTART_SEARCH_MS = 10 * 60_000;
export const STANDING_RESTART_MIN_STOP_MS = 5_000;
// At or below this speed (km/h) the car counts as stationary.
export const STANDING_RESTART_STOPPED_KMH = 1;
// Above this playback speed the beeps would run together, so they're skipped.
export const START_LIGHTS_SOUND_MAX_SPEED = 4;
// Beep played as each light comes on (lights out is silent). If the file is
// missing or can't be decoded, a synthesized tone plays instead.
export const START_LIGHT_SOUND_URL = `${import.meta.env.BASE_URL}sounds/start-light.mp3`;
// Chime played before each team-radio message. The message starts once the
// chime's main beep has played; its fading tail runs underneath.
export const RADIO_INTRO_SOUND_URL = `${import.meta.env.BASE_URL}sounds/radio-intro.mp3`;
export const RADIO_INTRO_LEAD_MS = 600;

// ── API rate limiting ───────────────────────────────────────────────────────--
// OpenF1 free tier: 3 req/s and 30 req/min.
// We cap at 2/s and 25/min to keep headroom and avoid hitting server limits
// after a fresh page load (server window doesn't reset with the client).
export const RATE_MAX_PER_SECOND = 2;
export const RATE_MAX_PER_MINUTE = 25;
export const RATE_MAX_RETRIES = 6;

// Standard F1 qualifying: only the top 10 drivers progress to Q3.
export const Q3_GRID_SIZE = 10;

// Running length of each qualifying phase (Q1/Q2/Q3). The clock stops under a
// red flag and the breaks between phases don't count. Q3 grew to 13 min in
// 2026. Finished phases use the running time recorded in the feed instead.
export const QUALI_PHASE_DURATIONS_MS = [18 * 60_000, 15 * 60_000, 12 * 60_000];
export const QUALI_Q3_13_MIN_FROM_YEAR = 2026;
export const QUALI_Q3_13_MIN_MS = 13 * 60_000;
export const SPRINT_QUALI_PHASE_DURATIONS_MS = [
  12 * 60_000,
  10 * 60_000,
  8 * 60_000,
];

// ── Telemetry corner zones ──────────────────────────────────────────────────--
// Apex-speed thresholds (km/h) used to classify a corner as low/medium/high
// speed on the telemetry charts, mirroring F1 broadcast lap-time analysis.
export const CORNER_LOW_SPEED_KMH = 140;
export const CORNER_HIGH_SPEED_KMH = 220;

// A corner zone extends outward from the apex until speed recovers to this
// fraction of the surrounding straight-line speed.
export const CORNER_ZONE_RECOVERY = 0.93;

// Speed traces wobble by a few km/h between samples. While searching for the
// straight-line peak either side of an apex, a dip smaller than this is noise,
// not the end of the braking/acceleration phase.
export const CORNER_PEAK_NOISE_KMH = 8;

// Corner analysis: OpenF1 reports brake as 0/100, and throttle rarely reads a
// clean 100, so these thresholds classify "on the brakes" / "flat out".
export const CORNER_BRAKE_ON_PCT = 50;
export const CORNER_FULL_THROTTLE_PCT = 95;
// How far before a corner zone to look for the braking point, and after it to
// look for the return to full throttle (metres).
export const CORNER_BRAKE_LOOKBACK_M = 200;
// Brake-off gaps up to this long (metres) inside one braking phase are
// bridged: the 0/100 brake signal often drops out for a sample or two, e.g.
// when a driver briefly releases the pedal before flicking into a chicane.
export const CORNER_BRAKE_GAP_M = 30;
export const CORNER_THROTTLE_LOOKAHEAD_M = 200;
// Lead-in/run-out added either side of a corner zone when zooming charts to it.
export const CORNER_FOCUS_PADDING_M = 80;

// Fill/stroke tints for each corner speed class.
export const CORNER_ZONE_COLORS = {
  low: "rgba(232, 0, 45, 0.13)",
  medium: "rgba(245, 202, 95, 0.12)",
  high: "rgba(65, 217, 122, 0.12)",
} as const;
// Solid accents for the corner label strip above the chart.
export const CORNER_ZONE_ACCENT_COLORS = {
  low: "rgba(232, 0, 45, 0.75)",
  medium: "rgba(245, 202, 95, 0.75)",
  high: "rgba(65, 217, 122, 0.75)",
} as const;
// Narrower corner bands show only their colour bar, no text (avoids overlap on mobile).
export const CORNER_ZONE_LABEL_MIN_PX = 30;

// OpenF1 /pit `date` marks pit-lane EXIT, so the in-pit window is
// [date - lane_duration, date]. When lane_duration is missing (e.g. a car
// leaving the garage at session start) assume this much pit-lane time.
export const PIT_LANE_FALLBACK_MS = 30_000;

// ── Leaderboard telemetry ─────────────────────────────────────────────────────
/** RPM at which the combined telemetry rev bar is full (just above a typical
 *  race-engine peak). */
export const TELEMETRY_RPM_BAR_MAX = 13_000;
/** RPM from which the rev bar turns red (shift light). */
export const TELEMETRY_RPM_SHIFT = 11_800;
/** RPM from which the rev bar turns amber. */
export const TELEMETRY_RPM_HIGH = 10_500;
/** Speed (km/h) at which the leaderboard speed bar is full. */
export const TELEMETRY_SPEED_BAR_MAX_KMH = 350;

// ── Focused driver telemetry HUD ──────────────────────────────────────────────
/** Playhead resolution (ms) of the focused-driver HUD (car_data is ~3.7 Hz). */
export const FOCUSED_TELEMETRY_TICK_MS = 250;
/** Number of steering-wheel shift lights (green · red · blue thirds). */
export const TELEMETRY_SHIFT_LIGHTS = 15;
/** RPM at which the first shift light comes on; all are lit at TELEMETRY_RPM_SHIFT. */
export const TELEMETRY_SHIFT_LIGHTS_MIN_RPM = 8_500;
/** Span of recent speed history drawn in the HUD speed trace. */
export const TELEMETRY_TRACE_WINDOW_MS = 15_000;
/** OpenF1 car_data `drs` value meaning "eligible / detected" (≥ 10 is open). */
export const DRS_ELIGIBLE_VALUE = 8;
/** OpenF1 car_data `drs` value from which the flap is open. */
export const DRS_OPEN_MIN_VALUE = 10;

// ── Deferred loading ──────────────────────────────────────────────────────────
/** Max wait (ms) for an idle period before running deferred non-critical work. */
export const IDLE_CALLBACK_TIMEOUT_MS = 4_000;
/** Min viewport width (px) at which the Buy Me a Coffee widget is shown/loaded. */
export const COFFEE_WIDGET_MIN_WIDTH_PX = 768;

// ── Query cache persistence (IndexedDB) ───────────────────────────────────────
/** Persisted queries older than this are dropped (historical data never changes). */
export const QUERY_PERSIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Min gap between sweeps that delete expired persisted queries. */
export const QUERY_PERSIST_GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ── Race control ticker (session info bar) ────────────────────────────────────
/** A race control message counts as "new" (pulse dot, entrance flash) for this long. */
export const RC_TICKER_FRESH_MS = 30_000;

// ── Event toasts ──────────────────────────────────────────────────────────────
/** A forward jump (session ms) larger than this clears the toast queue instead of replaying it. */
export const TOAST_JUMP_THRESHOLD_MS = 5_000;
/** Unpinned toasts are dismissed after this long (wall-clock ms). */
export const TOAST_AUTO_DISMISS_MS = 8_000;

/** "While you were away": jumping to a skipped event starts this far before it. */
export const CATCHUP_REPLAY_LEAD_MS = 5_000;
/** Minimum forward jump (session ms) that opens the "While you were away" summary. */
export const CATCHUP_JUMP_THRESHOLD_MS = 60_000;

// ── Race analysis (tyre degradation) ──────────────────────────────────────────
/** A lap this much slower than its stint's median is traffic or a mistake, not pace. */
export const RACE_PACE_OUTLIER_PCT = 0.05;
/** Fewest clean laps a stint needs before a degradation slope is fitted. */
export const RACE_PACE_MIN_LAPS = 8;
/** Optional fuel correction: lap time a car gains per lap as fuel burns off (s/lap). */
export const RACE_PACE_FUEL_S_PER_LAP = 0.05;
/** Degradation colour bands (s/lap): up to LOW is gentle, above HIGH is heavy. */
export const RACE_PACE_DEG_LOW = 0.03;
export const RACE_PACE_DEG_HIGH = 0.08;
/** Fits explaining less of the lap-time spread than this (r²) are shown as noisy. */
export const RACE_PACE_NOISY_R2 = 0.2;

// ── Race analysis (undercut / overcut) ────────────────────────────────────────
/** Two cars count as fighting when this close on track (s) as the first one pits. */
export const UNDERCUT_MAX_GAP_S = 3.5;
/** The rival must stop within this many laps of the first stop to make it a battle. */
export const UNDERCUT_MAX_LAG_LAPS = 5;
/** Stops before this lap are first-lap damage, not strategy, and the field hasn't settled. */
export const UNDERCUT_MIN_STOP_LAP = 5;

// ── App tour ──────────────────────────────────────────────────────────────────
/** Bump when the tour changes enough that returning users should see it again. */
export const TOUR_VERSION = 1;

// ── Deploys ───────────────────────────────────────────────────────────────────
/**
 * After a deploy, a tab opened earlier asks for chunks that no longer exist and
 * the page reloads once to pick up the new build. A second failure within this
 * window shows the error instead, so a genuinely missing chunk can't loop.
 */
export const STALE_CHUNK_RELOAD_COOLDOWN_MS = 30_000;
