/**
 * Mapbox fill layers for the real-width track surface (see trackSurface.ts),
 * coloured per Standard light preset.
 */
import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import {
  MAP3D_KERB_COLORS,
  MAP3D_SURFACE_MIN_ZOOM,
  MAP3D_TRACK_PALETTE,
} from "@/constants";
import type { LightPreset } from "./atmosphere";
import type { TrackSurface } from "./trackSurface";

const LAYERS = {
  verge: "map3d-surface-verge",
  pitLane: "map3d-surface-pit-lane",
  track: "map3d-surface-track",
  kerbsBase: "map3d-surface-kerbs-base",
  kerbsStripes: "map3d-surface-kerbs-stripes",
  startBase: "map3d-surface-start-base",
  startSquares: "map3d-surface-start-squares",
} as const;

/** Surface fades in over half a zoom level as the line-drawn track fades out. */
export function fadeIn(opacity: number): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    MAP3D_SURFACE_MIN_ZOOM - 0.5,
    0,
    MAP3D_SURFACE_MIN_ZOOM,
    opacity,
  ];
}

/** The inverse, for the low-zoom line track. */
export function fadeOut(opacity: number): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    MAP3D_SURFACE_MIN_ZOOM - 0.5,
    opacity,
    MAP3D_SURFACE_MIN_ZOOM,
    0,
  ];
}

/** Fill colour, opacity and emissive strength for each surface layer. */
export function surfacePaint(preset: LightPreset) {
  const p = MAP3D_TRACK_PALETTE[preset];
  const [kerbBase, kerbStripe] = MAP3D_KERB_COLORS;
  return {
    [LAYERS.verge]: { color: p.casing, opacity: p.casingOpacity, emissive: p.emissive },
    [LAYERS.pitLane]: { color: p.surface, opacity: 1, emissive: p.emissive },
    [LAYERS.track]: { color: p.surface, opacity: 1, emissive: p.emissive },
    [LAYERS.kerbsBase]: { color: kerbBase, opacity: 1, emissive: p.emissive },
    [LAYERS.kerbsStripes]: { color: kerbStripe, opacity: 1, emissive: p.emissive },
    [LAYERS.startBase]: { color: "#ffffff", opacity: 1, emissive: p.emissive },
    [LAYERS.startSquares]: { color: "#111111", opacity: 1, emissive: p.emissive },
  };
}

/** Add the surface sources and layers once per map, under `before`. */
export function addTrackSurfaceLayers(
  map: MapboxMap,
  surface: TrackSurface,
  preset: LightPreset,
  before: string,
): void {
  const paint = surfacePaint(preset);
  const add = (key: keyof typeof LAYERS) => {
    const id = LAYERS[key];
    map.addSource(id, { type: "geojson", data: surface[key] });
    map.addLayer(
      {
        id,
        type: "fill",
        source: id,
        slot: "middle",
        minzoom: MAP3D_SURFACE_MIN_ZOOM - 0.5,
        paint: {
          "fill-color": paint[id].color,
          "fill-opacity": fadeIn(paint[id].opacity),
          "fill-emissive-strength": paint[id].emissive,
          "fill-antialias": true,
        },
      },
      before,
    );
  };
  // Bottom to top.
  add("verge");
  add("pitLane");
  add("track");
  add("kerbsBase");
  add("kerbsStripes");
  add("startBase");
  add("startSquares");
}

/** Recolour the surface for a new light preset. */
export function applyTrackPalette(map: MapboxMap, preset: LightPreset): void {
  for (const [id, p] of Object.entries(surfacePaint(preset))) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "fill-color", p.color);
    map.setPaintProperty(id, "fill-opacity", fadeIn(p.opacity));
    map.setPaintProperty(id, "fill-emissive-strength", p.emissive);
  }
}
