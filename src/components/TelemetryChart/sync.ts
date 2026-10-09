export const X_SYNC_EVENT = "telemetrychart:x-sync";
export const X_SYNC_GROUP = "telemetry";

/**
 * Zooms every mounted telemetry chart to the given x (distance) range, e.g.
 * when the user picks a corner from the corner analysis table.
 */
export function focusTelemetryCharts(min: number, max: number) {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;

  // sourceId 0 never matches a chart instance, so every chart applies it.
  window.dispatchEvent(
    new CustomEvent(X_SYNC_EVENT, {
      detail: { group: X_SYNC_GROUP, sourceId: 0, min, max },
    }),
  );
}
