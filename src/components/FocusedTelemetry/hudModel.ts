import {
  DRS_ELIGIBLE_VALUE,
  DRS_OPEN_MIN_VALUE,
  TELEMETRY_RPM_SHIFT,
  TELEMETRY_SHIFT_LIGHTS,
  TELEMETRY_SHIFT_LIGHTS_MIN_RPM,
} from "@/constants";
import { windowBoundsByValue } from "@/utils/sortedTime";

export type DrsState = "open" | "eligible" | "off";

export function drsState(drs: number | null | undefined): DrsState | null {
  if (drs == null) return null;
  if (drs >= DRS_OPEN_MIN_VALUE) return "open";
  if (drs === DRS_ELIGIBLE_VALUE) return "eligible";
  return "off";
}

/** Lit shift lights for an RPM; every light is lit from the shift point. */
export function shiftLightsLit(rpm: number): number {
  if (rpm >= TELEMETRY_RPM_SHIFT) return TELEMETRY_SHIFT_LIGHTS;
  const span = TELEMETRY_RPM_SHIFT - TELEMETRY_SHIFT_LIGHTS_MIN_RPM;
  const frac = (rpm - TELEMETRY_SHIFT_LIGHTS_MIN_RPM) / span;
  if (frac <= 0) return 0;
  return Math.min(
    TELEMETRY_SHIFT_LIGHTS - 1,
    Math.ceil(frac * TELEMETRY_SHIFT_LIGHTS),
  );
}

export type ShiftLightTone = "green" | "red" | "blue";

/** Steering-wheel layout: first third green, middle red, last third blue. */
export function shiftLightTone(index: number): ShiftLightTone {
  const third = TELEMETRY_SHIFT_LIGHTS / 3;
  if (index < third) return "green";
  if (index < third * 2) return "red";
  return "blue";
}

export interface TraceSample {
  readonly ms: number;
  readonly speed: number;
  readonly brake: number;
}

export interface SpeedTrace {
  /** SVG polyline points for speed. */
  readonly points: string;
  /** x of the first and last plotted sample (for the area fill). */
  readonly x0: number;
  readonly x1: number;
  /** [x0, x1] spans where the brake is applied. */
  readonly brakeSpans: ReadonlyArray<readonly [number, number]>;
}

/** Speed history over the `windowMs` before `t`, scaled into a w × h box
 *  (y = 0 at `maxSpeed`). `samples` must be sorted by `ms`. */
export function buildSpeedTrace(
  samples: readonly TraceSample[],
  t: number,
  windowMs: number,
  width: number,
  height: number,
  maxSpeed: number,
): SpeedTrace | null {
  const start = t - windowMs;
  const { startIndex, endIndex } = windowBoundsByValue(
    samples,
    start,
    t,
    (s) => s.ms,
  );
  // Include the sample just before the window so the line reaches the left edge.
  const from = Math.max(0, startIndex - 1);
  if (endIndex - from < 2) return null;

  const x = (ms: number) =>
    Math.max(0, Math.min(width, ((ms - start) / windowMs) * width));
  const y = (speed: number) =>
    height - (Math.max(0, Math.min(maxSpeed, speed)) / maxSpeed) * height;

  const points: string[] = [];
  const brakeSpans: Array<[number, number]> = [];
  let brakeStart: number | null = null;
  for (let i = from; i < endIndex; i++) {
    const s = samples[i]!;
    const px = x(s.ms);
    points.push(`${px.toFixed(1)},${y(s.speed).toFixed(1)}`);
    const braking = s.brake > 0;
    if (braking && brakeStart === null) brakeStart = px;
    if (!braking && brakeStart !== null) {
      brakeSpans.push([brakeStart, px]);
      brakeStart = null;
    }
  }
  if (brakeStart !== null) {
    brakeSpans.push([brakeStart, x(samples[endIndex - 1]!.ms)]);
  }
  return {
    points: points.join(" "),
    x0: x(samples[from]!.ms),
    x1: x(samples[endIndex - 1]!.ms),
    brakeSpans,
  };
}
