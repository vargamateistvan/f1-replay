import { describe, expect, it } from "vitest";
import {
  isBrightPreset,
  lightPresetAt,
  lightPresetForTheme,
  rainFor,
  sunElevationDeg,
} from "./atmosphere";

const SINGAPORE = { lat: 1.29, lng: 103.86 };
const MONACO = { lat: 43.73, lng: 7.42 };
const LAS_VEGAS = { lat: 36.11, lng: -115.17 };

describe("sunElevationDeg", () => {
  it("is high at local noon near the equator and below the horizon at midnight", () => {
    // Solar noon in Singapore ≈ 05:05 UTC (its clocks run ~1 h ahead of the sun).
    expect(sunElevationDeg(Date.UTC(2025, 2, 20, 5, 5), SINGAPORE.lat, SINGAPORE.lng)).toBeGreaterThan(85);
    expect(sunElevationDeg(Date.UTC(2025, 2, 20, 16, 0), SINGAPORE.lat, SINGAPORE.lng)).toBeLessThan(-60);
  });
});

describe("lightPresetAt", () => {
  it("lights the Monaco GP (15:00 local, May) as day", () => {
    expect(lightPresetAt(Date.parse("2025-05-25T13:00:00Z"), MONACO.lat, MONACO.lng)).toBe("day");
  });

  it("makes Singapore (20:00 local) and Las Vegas (22:00 local) night races night", () => {
    expect(lightPresetAt(Date.parse("2025-10-05T12:00:00Z"), SINGAPORE.lat, SINGAPORE.lng)).toBe("night");
    expect(lightPresetAt(Date.parse("2025-11-23T06:00:00Z"), LAS_VEGAS.lat, LAS_VEGAS.lng)).toBe("night");
  });

  it("tells dusk from dawn by whether the sun is setting", () => {
    // Monaco, late May: sunset ≈ 19:10 UTC, sunrise ≈ 03:55 UTC.
    expect(lightPresetAt(Date.parse("2025-05-25T19:20:00Z"), MONACO.lat, MONACO.lng)).toBe("dusk");
    expect(lightPresetAt(Date.parse("2025-05-25T03:50:00Z"), MONACO.lat, MONACO.lng)).toBe("dawn");
  });
});

describe("theme fallback and brightness", () => {
  it("maps the app theme to day / night", () => {
    expect(lightPresetForTheme(true)).toBe("day");
    expect(lightPresetForTheme(false)).toBe("night");
    expect(isBrightPreset("dawn")).toBe(true);
    expect(isBrightPreset("dusk")).toBe(false);
  });
});

describe("rainFor", () => {
  it("is dry without rainfall and heavier with humidity", () => {
    expect(rainFor(null)).toBeNull();
    expect(rainFor({ rainfall: 0, humidity: 95 })).toBeNull();
    const light = rainFor({ rainfall: 1, humidity: 60 })!;
    const heavy = rainFor({ rainfall: 1, humidity: 100 })!;
    expect(heavy.density).toBeGreaterThan(light.density);
    expect(heavy.intensity).toBeCloseTo(1);
  });
});
