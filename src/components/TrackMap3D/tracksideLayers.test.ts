import { describe, expect, it, vi } from "vitest";
import type { Map as MapboxMap } from "mapbox-gl";
import { MAP3D_TRACK_PALETTE } from "@/constants";
import {
  addTracksideLayers,
  applyTracksidePalette,
  setTracksideVisibility,
  TRACKSIDE_LAYERS,
  tracksideEmissive,
} from "./tracksideLayers";

function fakeMap() {
  const layers = new Map<string, Record<string, unknown>>();
  const map = {
    addSource: vi.fn(),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    getLayer: (id: string) => layers.get(id),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  };
  return { map, layers, mapbox: map as unknown as MapboxMap };
}

const empty = { type: "FeatureCollection" as const, features: [] };

describe("trackside layers", () => {
  it("extrudes each feature from its own base to its own height and colour", () => {
    const { map, layers, mapbox } = fakeMap();
    addTracksideLayers(mapbox, { solid: empty, fence: empty }, "day", true, "before");
    expect(map.addSource).toHaveBeenCalledTimes(2);
    const solid = layers.get(TRACKSIDE_LAYERS.solid) as { type: string; paint: Record<string, unknown> };
    expect(solid.type).toBe("fill-extrusion");
    expect(solid.paint["fill-extrusion-color"]).toEqual(["get", "color"]);
    expect(solid.paint["fill-extrusion-base"]).toEqual(["get", "base"]);
    expect(solid.paint["fill-extrusion-height"]).toEqual(["get", "height"]);
    const fence = layers.get(TRACKSIDE_LAYERS.fence) as { paint: Record<string, unknown> };
    expect(fence.paint["fill-extrusion-cast-shadows"]).toBe(false);
  });

  it("starts hidden when the setting is off, and toggles", () => {
    const { map, layers, mapbox } = fakeMap();
    addTracksideLayers(mapbox, { solid: empty, fence: empty }, "day", false, "before");
    expect((layers.get(TRACKSIDE_LAYERS.solid) as { layout: unknown }).layout).toEqual({
      visibility: "none",
    });
    setTracksideVisibility(mapbox, true);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(TRACKSIDE_LAYERS.fence, "visibility", "visible");
  });

  it("glows a little more at night", () => {
    expect(tracksideEmissive("night")).toBeGreaterThan(tracksideEmissive("day"));
    expect(tracksideEmissive("day")).toBeGreaterThanOrEqual(MAP3D_TRACK_PALETTE.day.emissive);
    const { map, mapbox } = fakeMap();
    addTracksideLayers(mapbox, { solid: empty, fence: empty }, "day", true, "before");
    applyTracksidePalette(mapbox, "night");
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      TRACKSIDE_LAYERS.solid,
      "fill-extrusion-emissive-strength",
      tracksideEmissive("night"),
    );
  });
});
