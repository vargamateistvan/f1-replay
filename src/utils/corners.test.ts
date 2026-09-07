import { describe, expect, it } from "vitest";
import {
  buildCornerZones,
  classifyCornerSpeed,
  cornerSpeedLabel,
} from "@/utils/corners";

/** Builds an evenly spaced distance axis. */
function axis(count: number, step: number): number[] {
  return Array.from({ length: count }, (_, i) => i * step);
}

describe("classifyCornerSpeed", () => {
  it("buckets apex speeds into low, medium and high", () => {
    expect(classifyCornerSpeed(80)).toBe("low");
    expect(classifyCornerSpeed(180)).toBe("medium");
    expect(classifyCornerSpeed(260)).toBe("high");
  });
});

describe("cornerSpeedLabel", () => {
  it("renders a human readable label per class", () => {
    expect(cornerSpeedLabel("low")).toBe("Low speed");
    expect(cornerSpeedLabel("medium")).toBe("Medium speed");
    expect(cornerSpeedLabel("high")).toBe("High speed");
  });
});

describe("buildCornerZones", () => {
  it("returns nothing without corners or telemetry", () => {
    expect(buildCornerZones([], axis(10, 10), new Array(10).fill(300))).toEqual(
      [],
    );
    expect(buildCornerZones([{ label: "1", distance: 0 }], [], [])).toEqual([]);
  });

  it("anchors a zone on the local speed minimum and classifies it", () => {
    const xDist = axis(41, 10);
    const speeds = xDist.map((d) => {
      if (d === 200) return 90;
      return d >= 160 && d <= 240 ? 120 : 300;
    });

    const zones = buildCornerZones(
      [{ label: "1", distance: 210 }],
      xDist,
      speeds,
    );

    expect(zones).toHaveLength(1);
    expect(zones[0]!.labels).toEqual(["1"]);
    expect(zones[0]!.apexes).toEqual([200]);
    expect(zones[0]!.minSpeed).toBe(90);
    expect(zones[0]!.speedClass).toBe("low");
    expect(zones[0]!.startDistance).toBeLessThan(200);
    expect(zones[0]!.endDistance).toBeGreaterThan(200);
  });

  it("merges corners whose zones overlap into a single band", () => {
    const xDist = axis(61, 10);
    // One long slow section covering two nearby apexes.
    const speeds = xDist.map((d) => (d >= 200 && d <= 320 ? 100 : 300));

    const zones = buildCornerZones(
      [
        { label: "4", distance: 220 },
        { label: "5", distance: 300 },
      ],
      xDist,
      speeds,
    );

    expect(zones).toHaveLength(1);
    expect(zones[0]!.labels).toEqual(["4", "5"]);
    expect(zones[0]!.apexes).toHaveLength(2);
    expect(zones[0]!.key).toBe("corner-zone-4-5");
  });

  it("keeps well separated corners as distinct zones", () => {
    const xDist = axis(101, 10);
    const speeds = xDist.map((d) => {
      if (d >= 180 && d <= 220) return 110;
      if (d >= 780 && d <= 820) return 250;
      return 320;
    });

    const zones = buildCornerZones(
      [
        { label: "1", distance: 200 },
        { label: "9", distance: 800 },
      ],
      xDist,
      speeds,
    );

    expect(zones).toHaveLength(2);
    expect(zones[0]!.speedClass).toBe("low");
    expect(zones[1]!.speedClass).toBe("high");
    expect(zones[0]!.endDistance).toBeLessThan(zones[1]!.startDistance);
  });

  it("ignores corners with a non finite distance", () => {
    const xDist = axis(41, 10);
    const speeds = xDist.map((d) => (d === 200 ? 90 : 300));

    const zones = buildCornerZones(
      [
        { label: "1", distance: Number.NaN },
        { label: "2", distance: 200 },
      ],
      xDist,
      speeds,
    );

    expect(zones).toHaveLength(1);
    expect(zones[0]!.labels).toEqual(["2"]);
  });
});
