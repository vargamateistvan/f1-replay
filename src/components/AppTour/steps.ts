import type { Step } from "react-joyride";
import { TOUR_TARGET, tourSelector, visibleTourTarget } from "./targets";

export interface TourContext {
  /** Phone layout (below `md`): tabbed tracker + bottom nav. */
  readonly isCompact: boolean;
  /** Race or Sprint: the scrubber shows race start and chequered flag markers. */
  readonly isRace: boolean;
  /** The 3D map can be shown (Mapbox token, WebGL2, baked circuit). */
  readonly has3d: boolean;
}

const welcome: Step = {
  id: "welcome",
  target: "body",
  placement: "center",
  title: "Welcome to F1 Replay",
  content:
    "Scrub through any Formula 1 session like a replay video. Here's a quick look around.",
};

const sessionPicker: Step = {
  id: "session-picker",
  target: tourSelector(TOUR_TARGET.sessionPicker),
  placement: "bottom-start",
  title: "Pick a session",
  content:
    "Choose a season, Grand Prix and session. Latest jumps to the most recent one.",
};

function playback({ isRace, isCompact }: TourContext): Step {
  const markers = isRace
    ? "Markers show race control messages, the race start and the chequered flag."
    : "Markers show race control messages.";
  const keys = isCompact
    ? ""
    : " Space plays or pauses, ←/→ seek, ↑/↓ change speed and [ / ] jump a lap.";
  return {
    id: "playback",
    target: tourSelector(TOUR_TARGET.playback),
    placement: "top",
    title: "Play, scrub and speed up",
    content: `Drag the timeline to any moment and replay at 1–16×. ${markers}${keys}`,
  };
}

const trackMap: Step = {
  id: "track-map",
  target: tourSelector(TOUR_TARGET.trackMap),
  placement: "left",
  title: "Live track map",
  content:
    "Every car, animated from GPS. Click a car to focus it and follow it around the lap.",
};

function mapViews({ has3d }: TourContext): Step {
  const views = has3d
    ? "Switch between the 2D map, the 3D map with follow, chase and onboard cameras, and the ring view."
    : "Switch between the 2D map and the ring view.";
  return {
    id: "map-views",
    target: visibleTourTarget(TOUR_TARGET.mapViews),
    placement: "bottom-end",
    title: "Change the view",
    content: `${views} The ring is a clock face spaced by lap time, so the angle between two cars is their gap.`,
  };
}

const desktopSteps = (ctx: TourContext): Step[] => [
  welcome,
  sessionPicker,
  {
    id: "view-tabs",
    target: tourSelector(TOUR_TARGET.viewTabs),
    placement: "bottom",
    title: "Three ways to watch",
    content:
      "Leaderboard, Driver Tracker and Commentary. Press 1, 2 or 3 to switch.",
  },
  {
    id: "data-panel",
    target: tourSelector(TOUR_TARGET.dataPanel),
    placement: "right",
    title: "Timing and more",
    content:
      "Gaps, sectors, tyres and live car data. Click a driver to focus them; the tabs switch to tyre strategy, lap and gap charts.",
  },
  trackMap,
  mapViews(ctx),
  playback(ctx),
  {
    id: "analysis-links",
    target: tourSelector(TOUR_TARGET.analysisLinks),
    placement: "bottom",
    title: "Dig deeper",
    content:
      "Compare laps corner by corner in Telemetry, or follow the championship in Standings.",
  },
  {
    id: "help",
    target: tourSelector(TOUR_TARGET.help),
    placement: "bottom-end",
    title: "Need a hand?",
    content: "Press ? any time for help. You can replay this tour from there.",
  },
];

const compactSteps = (ctx: TourContext): Step[] => [
  welcome,
  sessionPicker,
  {
    id: "mobile-tracker-tabs",
    target: tourSelector(TOUR_TARGET.mobileTrackerTabs),
    placement: "bottom",
    title: "Timing, track and charts",
    content: `Switch between the timing tower, the live track map, tyre strategy and lap and gap charts. Tap a driver to focus them. On the map, the ${
      ctx.has3d ? "2D, 3D and ring" : "2D and ring"
    } buttons change its view.`,
  },
  playback(ctx),
  {
    id: "mobile-nav",
    target: tourSelector(TOUR_TARGET.mobileNav),
    placement: "top",
    title: "Tracker and feeds",
    content:
      "Feeds has race control, team radio and the key moments of the session.",
  },
  {
    id: "mobile-more",
    target: tourSelector(TOUR_TARGET.mobileMore),
    placement: "top-end",
    title: "Everything else",
    content:
      "Telemetry, Standings, Settings, and Help, where you can replay this tour.",
  },
];

/** Tour steps for the main replay page, for the layout on screen. */
export function buildTourSteps(ctx: TourContext): Step[] {
  return ctx.isCompact ? compactSteps(ctx) : desktopSteps(ctx);
}
