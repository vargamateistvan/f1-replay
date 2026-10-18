/**
 * Session-time lighting and weather for the 3D map: the Standard style's
 * light preset follows the sun at the circuit at the playhead's instant, so
 * night races look like night, and OpenF1 rainfall turns on Mapbox rain,
 * rain haze (fog) and a wet asphalt palette.
 */
import type { FogSpecification } from "mapbox-gl";
import type { Weather } from "@/api/types";
import {
  MAP3D_RAIN_FOG,
  MAP3D_RAIN_FOG_RANGE_HEAVY,
  MAP3D_RAIN_FOG_RANGE_LIGHT,
  MAP3D_SUN_DAY_DEG,
  MAP3D_SUN_NIGHT_DEG,
} from "@/constants";

export type LightPreset = "dawn" | "day" | "dusk" | "night";

const DEG = Math.PI / 180;

/**
 * Sun elevation above the horizon (degrees) at a place and UTC instant, using
 * the NOAA low-precision solar position formulas (well under 1° error, plenty
 * for picking a light preset).
 */
export function sunElevationDeg(utcMs: number, lat: number, lng: number): number {
  const date = new Date(utcMs);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((utcMs - startOfYear) / 86_400_000);
  const hours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  // Fractional year (radians).
  const g = ((2 * Math.PI) / 365) * (dayOfYear + (hours - 12) / 24);
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const trueSolarMin = hours * 60 + eqTimeMin + 4 * lng;
  const hourAngle = (trueSolarMin / 4 - 180) * DEG;
  const cosZenith =
    Math.sin(lat * DEG) * Math.sin(decl) +
    Math.cos(lat * DEG) * Math.cos(decl) * Math.cos(hourAngle);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / DEG;
}

/**
 * Light preset for the circuit at `utcMs`: day with the sun well up, night
 * once it's well down, and dawn / dusk in between depending on whether the
 * sun is rising or setting.
 */
export function lightPresetAt(utcMs: number, lat: number, lng: number): LightPreset {
  const elevation = sunElevationDeg(utcMs, lat, lng);
  if (elevation >= MAP3D_SUN_DAY_DEG) return "day";
  if (elevation <= MAP3D_SUN_NIGHT_DEG) return "night";
  const rising = sunElevationDeg(utcMs + 10 * 60_000, lat, lng) > elevation;
  return rising ? "dawn" : "dusk";
}

/** Theme-only fallback, when session lighting is turned off. */
export function lightPresetForTheme(lightMode: boolean): LightPreset {
  return lightMode ? "day" : "night";
}

/** Bright presets need dark map ink; dark ones need light ink. */
export function isBrightPreset(preset: LightPreset): boolean {
  return preset === "day" || preset === "dawn";
}

/**
 * Rain haze for `setFog`, or null when dry (keep the style's own fog).
 * Heavier rain (`intensity` from `rainFor`, 0.6–1) pulls the fog closer.
 */
export function rainFogFor(
  preset: LightPreset,
  rain: { intensity: number } | null,
): FogSpecification | null {
  if (!rain) return null;
  const c = MAP3D_RAIN_FOG[preset];
  const k = Math.max(0, Math.min(1, (rain.intensity - 0.6) / 0.4));
  const [l0, l1] = MAP3D_RAIN_FOG_RANGE_LIGHT;
  const [h0, h1] = MAP3D_RAIN_FOG_RANGE_HEAVY;
  return {
    range: [l0 + (h0 - l0) * k, l1 + (h1 - l1) * k],
    color: c.color,
    "high-color": c.high,
    "space-color": c.space,
    "horizon-blend": 0.12 + 0.1 * k,
    "star-intensity": 0,
  };
}

/**
 * Mapbox rain for the current weather sample, or null when dry. OpenF1's
 * `rainfall` is a 0/1 flag, so humidity scales how heavy it looks.
 */
export function rainFor(
  weather: Pick<Weather, "rainfall" | "humidity"> | null | undefined,
): { density: number; intensity: number } | null {
  if (!weather || !(weather.rainfall > 0)) return null;
  const wet = Math.max(0, Math.min(1, (weather.humidity - 60) / 40));
  return { density: 0.3 + 0.4 * wet, intensity: 0.6 + 0.4 * wet };
}
