/**
 * `data-tour` attribute values for elements the app tour points at. Kept apart
 * from the steps so tagging an element doesn't pull the tour into its chunk.
 * Desktop and phone layouts are both in the DOM (one hidden by CSS), so each
 * layout gets its own target — a selector would otherwise match the hidden one.
 */
export const TOUR_TARGET = {
  sessionPicker: "session-picker",
  viewTabs: "view-tabs",
  dataPanel: "data-panel",
  trackMap: "track-map",
  mapViews: "map-views",
  playback: "playback",
  analysisLinks: "analysis-links",
  help: "help",
  mobileTrackerTabs: "mobile-tracker-tabs",
  mobileNav: "mobile-nav",
  mobileMore: "mobile-more",
} as const;

export type TourTargetId = (typeof TOUR_TARGET)[keyof typeof TOUR_TARGET];

/** CSS selector for a tour target. */
export function tourSelector(id: TourTargetId): string {
  return `[data-tour="${id}"]`;
}

/**
 * Target for elements a hidden layout may also render (the map toolbar is in
 * both the phone Track tab and the desktop split): the first one on screen,
 * else the first in the DOM.
 */
export function visibleTourTarget(id: TourTargetId): () => HTMLElement | null {
  return () => {
    const all = Array.from(
      document.querySelectorAll<HTMLElement>(tourSelector(id)),
    );
    return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
  };
}
