import { describe, expect, it } from "vitest";
import { MAP3D_RUNOFF_PALETTE, MAP3D_TRACK_PALETTE, MAP3D_TRACK_WET_PALETTE } from "@/constants";
import { surfacePaint } from "./surfaceLayers";

const TRACK = "map3d-surface-track";

describe("surfacePaint", () => {
  it("uses the dry asphalt by default", () => {
    const paint = surfacePaint("day");
    expect(paint[TRACK]).toMatchObject({
      color: MAP3D_TRACK_PALETTE.day.surface,
      emissive: MAP3D_TRACK_PALETTE.day.emissive,
    });
  });

  it("darkens the asphalt and adds sheen when wet, leaving kerbs alone", () => {
    const dry = surfacePaint("night");
    const wet = surfacePaint("night", true);
    expect(wet[TRACK]).toMatchObject({
      color: MAP3D_TRACK_WET_PALETTE.night.surface,
      emissive: MAP3D_TRACK_WET_PALETTE.night.emissive,
    });
    expect(wet[TRACK]!.emissive).toBeGreaterThan(dry[TRACK]!.emissive);
    const kerbs = (Object.keys(dry) as Array<keyof typeof dry>).filter((id) =>
      id.includes("kerb"),
    );
    expect(kerbs.length).toBeGreaterThan(0);
    for (const id of kerbs) expect(wet[id]).toEqual(dry[id]);
  });

  it("darkens the gravel when wet", () => {
    expect(surfacePaint("day")["map3d-surface-runoff"]!.color).toBe(MAP3D_RUNOFF_PALETTE.gravel.day.dry);
    expect(surfacePaint("day", true)["map3d-surface-runoff"]!.color).toBe(
      MAP3D_RUNOFF_PALETTE.gravel.day.wet,
    );
  });

  it("colours the run-off by the circuit's surface", () => {
    expect(surfacePaint("day", false, "tarmac")["map3d-surface-runoff"]!.color).toBe(
      MAP3D_RUNOFF_PALETTE.tarmac.day.dry,
    );
    expect(surfacePaint("night", true, "sand")["map3d-surface-runoff"]!.color).toBe(
      MAP3D_RUNOFF_PALETTE.sand.night.wet,
    );
    // Tarmac run-off stays lighter than the racing surface.
    expect(MAP3D_RUNOFF_PALETTE.tarmac.day.dry).not.toBe(MAP3D_TRACK_PALETTE.day.surface);
    expect(surfacePaint("day")["map3d-surface-runoff-bands"]!.color).toEqual(["get", "color"]);
  });

  it("mows the grass in two shades that follow the light preset", () => {
    const day = surfacePaint("day");
    expect(day["map3d-surface-grass"]!.color).toBe(MAP3D_TRACK_PALETTE.day.grass);
    expect(day["map3d-surface-grass-stripes"]!.color).toBe(MAP3D_TRACK_PALETTE.day.grassStripe);
    expect(surfacePaint("night")["map3d-surface-grass"]!.color).toBe(MAP3D_TRACK_PALETTE.night.grass);
  });
});
