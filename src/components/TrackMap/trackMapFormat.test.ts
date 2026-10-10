import { describe, expect, it } from "vitest";
import {
  formatClockAtOffset,
  formatTrackTimeZoneId,
  normalizeDeg,
  parseGmtOffsetToMinutes,
  speedToColor,
  windDir,
} from "./trackMapFormat";

describe("trackMapFormat", () => {
  it("maps speed onto the blue → red broadcast scale and clamps at 300 km/h", () => {
    expect(speedToColor(0)).toBe("hsl(240,100%,55%)");
    expect(speedToColor(150)).toBe("hsl(120,100%,55%)");
    expect(speedToColor(300)).toBe("hsl(0,100%,55%)");
    expect(speedToColor(360)).toBe("hsl(0,100%,55%)");
  });

  it("names the 16-point wind direction, wrapping at 360°", () => {
    expect(windDir(0)).toBe("N");
    expect(windDir(90)).toBe("E");
    expect(windDir(200)).toBe("SSW");
    expect(windDir(359)).toBe("N");
  });

  it("normalizes angles into [-180, 180]", () => {
    expect(normalizeDeg(190)).toBe(-170);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(720)).toBe(0);
    expect(normalizeDeg(45)).toBe(45);
  });

  it("parses OpenF1 gmt_offset strings, defaulting to 0", () => {
    expect(parseGmtOffsetToMinutes("03:00:00")).toBe(180);
    expect(parseGmtOffsetToMinutes("-05:00:00")).toBe(-300);
    expect(parseGmtOffsetToMinutes("+05:30")).toBe(330);
    expect(parseGmtOffsetToMinutes("garbage")).toBe(0);
    expect(parseGmtOffsetToMinutes(null)).toBe(0);
  });

  it("formats track time zones with the inverted IANA Etc/GMT sign", () => {
    expect(formatTrackTimeZoneId(0)).toBe("Etc/UTC");
    expect(formatTrackTimeZoneId(540)).toBe("Etc/GMT-9");
    expect(formatTrackTimeZoneId(-300)).toBe("Etc/GMT+5");
    expect(formatTrackTimeZoneId(330)).toBe("UTC+05:30");
  });

  it("formats a wall clock at a fixed offset from UTC", () => {
    const ms = Date.UTC(2024, 0, 1, 13, 5, 9);
    expect(formatClockAtOffset(ms, 0)).toBe("13:05:09");
    expect(formatClockAtOffset(ms, 180)).toBe("16:05:09");
  });
});
