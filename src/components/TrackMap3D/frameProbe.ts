/**
 * Dev-only frame-time probe for the 3D map's per-frame loop (`?debug=map3d`).
 * Records how long our own work takes each frame (car data, camera, overlays —
 * not Mapbox's rendering) and reports the average / worst every `everyMs`.
 * Budget: MAP3D_FRAME_BUDGET_MS.
 */
export interface FrameStats {
  frames: number;
  avgMs: number;
  maxMs: number;
}

export function createFrameProbe(
  everyMs: number,
  report: (stats: FrameStats) => void,
  now: () => number = () => performance.now(),
) {
  let windowStart = now();
  let frames = 0;
  let total = 0;
  let max = 0;
  return (workMs: number) => {
    frames++;
    total += workMs;
    if (workMs > max) max = workMs;
    const t = now();
    if (t - windowStart < everyMs) return;
    report({ frames, avgMs: total / frames, maxMs: max });
    windowStart = t;
    frames = 0;
    total = 0;
    max = 0;
  };
}

export function map3dDebugEnabled(search = globalThis.location?.search ?? ""): boolean {
  return new URLSearchParams(search).get("debug") === "map3d";
}
