/**
 * Mapbox fill-extrusion layers for the trackside objects (see trackside.ts):
 * opaque barriers / pit wall / gantry, and translucent catch fences.
 */
import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import { MAP3D_TRACK_PALETTE, MAP3D_TRACKSIDE_MIN_ZOOM } from "@/constants";
import type { LightPreset } from "./atmosphere";
import type { Trackside } from "./trackside";

export const TRACKSIDE_LAYERS = {
  solid: "map3d-trackside-solid",
  fence: "map3d-trackside-fence",
} as const;

const OPACITY = { solid: 1, fence: 0.28 } as const;

/** Fade in over half a zoom level; they're sub-pixel further out. */
function tracksideOpacity(opacity: number): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    MAP3D_TRACKSIDE_MIN_ZOOM - 0.5,
    0,
    MAP3D_TRACKSIDE_MIN_ZOOM,
    opacity,
  ];
}

/** Barriers light up a little at night, like the rest of the surface. */
export const tracksideEmissive = (preset: LightPreset) =>
  Math.min(1, MAP3D_TRACK_PALETTE[preset].emissive + 0.1);

/** Add the trackside sources and layers once per map, under `before`. */
export function addTracksideLayers(
  map: MapboxMap,
  trackside: Trackside,
  preset: LightPreset,
  visible: boolean,
  before: string,
): void {
  for (const key of ["solid", "fence"] as const) {
    const id = TRACKSIDE_LAYERS[key];
    map.addSource(id, { type: "geojson", data: trackside[key] });
    map.addLayer(
      {
        id,
        type: "fill-extrusion",
        source: id,
        slot: "middle",
        minzoom: MAP3D_TRACKSIDE_MIN_ZOOM - 0.5,
        layout: { visibility: visible ? "visible" : "none" },
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-opacity": tracksideOpacity(OPACITY[key]),
          "fill-extrusion-emissive-strength": tracksideEmissive(preset),
          "fill-extrusion-vertical-gradient": false,
          // Fences are see-through mesh; they shouldn't throw solid shadows.
          "fill-extrusion-cast-shadows": key === "solid",
        },
      },
      before,
    );
  }
}

export function applyTracksidePalette(map: MapboxMap, preset: LightPreset): void {
  for (const id of Object.values(TRACKSIDE_LAYERS)) {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, "fill-extrusion-emissive-strength", tracksideEmissive(preset));
    }
  }
}

export function setTracksideVisibility(map: MapboxMap, visible: boolean): void {
  for (const id of Object.values(TRACKSIDE_LAYERS)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}
