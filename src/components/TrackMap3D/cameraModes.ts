/**
 * Camera modes for the 3D map. The component owns the Mapbox calls; the
 * geometry here is pure so it can be unit-tested.
 *
 * - follow: top-down-ish chase that turns with the car (map center + bearing)
 * - chase:  low "TV chase" camera behind the car (Mapbox free camera)
 * - orbit:  slowly circle the focused car, or the track when none is focused
 */
import {
  MAP3D_CHASE_AHEAD_M,
  MAP3D_CHASE_BACK_M,
  MAP3D_CHASE_UP_M,
  MAP3D_ORBIT_DEG_PER_S,
} from "@/constants";

export type CameraMode = "follow" | "chase" | "orbit";

export const CAMERA_MODES: readonly CameraMode[] = ["follow", "chase", "orbit"];

export function nextCameraMode(mode: CameraMode): CameraMode {
  return CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length]!;
}

interface Enu {
  x: number;
  y: number;
}

/**
 * Chase camera pose in local east/north metres: the eye sits `back` metres
 * behind the car along its heading and `up` metres above it, looking at a
 * point `ahead` metres in front of the car.
 */
export function chasePose(
  car: Enu,
  headingDeg: number,
  {
    back = MAP3D_CHASE_BACK_M,
    up = MAP3D_CHASE_UP_M,
    ahead = MAP3D_CHASE_AHEAD_M,
  } = {},
): { eye: Enu; up: number; target: Enu } {
  const h = (headingDeg * Math.PI) / 180;
  // Compass heading: 0 = north (+y), 90 = east (+x).
  const dir = { x: Math.sin(h), y: Math.cos(h) };
  return {
    eye: { x: car.x - dir.x * back, y: car.y - dir.y * back },
    up,
    target: { x: car.x + dir.x * ahead, y: car.y + dir.y * ahead },
  };
}

/** Orbit bearing after `dtMs`, wrapped to [0, 360). */
export function orbitBearing(
  bearing: number,
  dtMs: number,
  degPerSec = MAP3D_ORBIT_DEG_PER_S,
): number {
  return (((bearing + (degPerSec * dtMs) / 1000) % 360) + 360) % 360;
}

/**
 * Per-frame lerp factor that gives the same smoothing at any frame rate:
 * `alpha` is tuned for 60 fps, and a slower frame (`dtMs` longer) catches up
 * proportionally more, so the camera doesn't trail the car on slow devices.
 */
export function frameAlpha(alpha: number, dtMs: number): number {
  return 1 - Math.pow(1 - alpha, Math.max(0, dtMs) / (1000 / 60));
}
