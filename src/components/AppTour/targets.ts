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
