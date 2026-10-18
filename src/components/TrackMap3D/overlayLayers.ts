/**
 * Mapbox sources and layers for the 3D map's track markup and telemetry
 * overlays (see `trackOverlays.ts` for the data). Kept out of TrackMap3D so
 * the component only decides *when* to add, update and show them.
 */
import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MapboxMap,
} from "mapbox-gl";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import type { CircuitGeoref } from "@/utils/georef";
import { groundWidthExpression, type FeatureCollection, type LineFeature, type PointFeature } from "./mapFeatures";
import {
  buildDirectionArrows,
  buildSectorMarkers,
  drawChevron,
  buildArcLine,
  drawPitGhost,
  trailGradient,
} from "./trackOverlays";
import type { ArcPolyline } from "@/components/TrackMap/trackGeometry";

export const SRC_OVERLAYS = "map3d-overlays";
export const SRC_HOTSPOTS = "map3d-hotspots";
export const SRC_GHOST = "map3d-pit-ghost";
export const SRC_TRAIL = "map3d-trail";
export const LAYER_TRAIL = "map3d-trail";
const SRC_SECTOR_TICKS = "map3d-sector-ticks";
const SRC_SECTOR_LABELS = "map3d-sector-labels";
const SRC_ARROWS = "map3d-arrows";
const IMG_CHEVRON = "map3d-chevron";
const IMG_GHOST_PREFIX = "map3d-ghost-";

const OVERLAY_LAYERS = {
  heat: "map3d-overlay-heat",
  delta: "map3d-overlay-delta",
  elevation: "map3d-overlay-elevation",
  elevationShadow: "map3d-overlay-elevation-shadow",
} as const;

const TRANSPARENT_GRADIENT: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["line-progress"],
  0,
  "rgba(0,0,0,0)",
  1,
  "rgba(0,0,0,0)",
];

/** Layers shown only with "enhanced track visuals", as on the 2D map. */
const ENHANCED_LAYERS = [
  "map3d-sector-ticks",
  "map3d-sector-labels",
  "map3d-arrows",
  "map3d-hotspots",
  "map3d-hotspots-core",
];

const empty = <F>(): FeatureCollection<F> => ({ type: "FeatureCollection", features: [] });

/** Add a canvas-drawn image (square, `side` CSS px) at device resolution. */
function addCanvasImage(
  map: MapboxMap,
  id: string,
  side: number,
  draw: (ctx: CanvasRenderingContext2D, unit: number) => void,
  unitPerPx: number,
) {
  const ratio = globalThis.devicePixelRatio || 1;
  const px = Math.ceil(side * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  draw(ctx, unitPerPx * ratio);
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio: ratio });
}

export interface OverlayContext {
  geom: CircuitGeometry;
  geo: CircuitGeoref;
  arc: ArcPolyline;
  /** Lap fractions where sectors 2 and 3 start (S1/S2 markers go there). */
  sectorBoundaries?: [number, number];
  lightMode: boolean;
  /** Pixels per 2D SVG unit (unfollowed), so markup matches 2D sizes. */
  scale: number;
  /** Telemetry segments go under this layer (the flag band). */
  segmentsBefore: string;
  /** Markup and the ghost go under this layer (the cars). */
  markupBefore: string;
}

/** Add every overlay source and layer once per map. */
export function addOverlayLayers(map: MapboxMap, ctx: OverlayContext): void {
  const { geom, geo, arc, lightMode, scale } = ctx;
  const lat = geo.originLat;
  const ink = lightMode ? "#303647" : "#d8deee";

  // One centerline per overlay kind, coloured by a line-gradient (lineMetrics
  // enables line-progress).
  map.addSource(SRC_OVERLAYS, { type: "geojson", data: buildArcLine(arc), lineMetrics: true });
  map.addSource(SRC_HOTSPOTS, { type: "geojson", data: empty<PointFeature>() });
  map.addSource(SRC_GHOST, { type: "geojson", data: empty<PointFeature>() });
  // lineMetrics enables `line-progress` for the trail's fade.
  map.addSource(SRC_TRAIL, { type: "geojson", data: empty<LineFeature>(), lineMetrics: true });
  const sectors = buildSectorMarkers(geom, geo, arc, ctx.sectorBoundaries);
  map.addSource(SRC_SECTOR_TICKS, { type: "geojson", data: sectors.ticks });
  map.addSource(SRC_SECTOR_LABELS, { type: "geojson", data: sectors.labels });
  map.addSource(SRC_ARROWS, { type: "geojson", data: buildDirectionArrows(geom, geo) });

  addCanvasImage(map, IMG_CHEVRON, 8 * scale, (c, unit) => drawChevron(c, unit, ink), scale);

  const segment = (id: string, widthM: number, minPx: number, opacity = 1) =>
    map.addLayer(
      {
        id,
        type: "line",
        source: SRC_OVERLAYS,
        slot: "middle",
        layout: { "line-cap": "butt", "line-join": "round", visibility: "none" },
        paint: {
          "line-emissive-strength": 1,
          "line-gradient": TRANSPARENT_GRADIENT,
          "line-opacity": opacity,
          "line-width": groundWidthExpression(widthM, lat, minPx),
        },
      },
      ctx.segmentsBefore,
    );
  // Same stack as 2D: elevation shadow, speed heat, lap delta, elevation accent.
  // Narrower than the 15 m asphalt so the surface and kerbs still show.
  segment(OVERLAY_LAYERS.elevationShadow, 12, 4, 0.15);
  segment(OVERLAY_LAYERS.heat, 4, 2.5);
  segment(OVERLAY_LAYERS.delta, 6, 3);
  segment(OVERLAY_LAYERS.elevation, 2, 1.5);

  const markup = (layer: LayerSpecification) =>
    map.addLayer({ ...layer, slot: "top" } as LayerSpecification, ctx.markupBefore);

  markup({
    id: LAYER_TRAIL,
    type: "line",
    source: SRC_TRAIL,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-width": 3 * scale,
      "line-gradient": trailGradient("#ffffff"),
    },
  });
  markup({
    id: "map3d-hotspots",
    type: "circle",
    source: SRC_HOTSPOTS,
    paint: {
      "circle-emissive-strength": 1,
      "circle-color": "#ff6a3d",
      "circle-radius": ["*", ["get", "radius"], scale],
      "circle-opacity": ["get", "opacity"],
      "circle-pitch-alignment": "map",
    },
  });
  markup({
    id: "map3d-hotspots-core",
    type: "circle",
    source: SRC_HOTSPOTS,
    paint: {
      "circle-emissive-strength": 1,
      "circle-color": "#ffd4b8",
      "circle-radius": ["*", ["max", 2.3, ["*", ["get", "radius"], 0.4]], scale],
      "circle-opacity": ["min", 0.92, ["+", ["get", "opacity"], 0.28]],
      "circle-pitch-alignment": "map",
    },
  });
  markup({
    id: "map3d-sector-ticks",
    type: "line",
    source: SRC_SECTOR_TICKS,
    layout: { "line-cap": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": "#9aa4be",
      "line-width": 3 * scale,
      "line-opacity": 0.82,
    },
  });
  markup({
    id: "map3d-sector-labels",
    type: "symbol",
    source: SRC_SECTOR_LABELS,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Inter Black"],
      "text-size": 4.8 * scale,
      "text-letter-spacing": 0.04,
      "text-allow-overlap": true,
    },
    paint: {
      "text-emissive-strength": 1,
      "text-occlusion-opacity": 1,
      "text-color": lightMode ? "#2a3246" : "#d4dbee",
      "text-halo-color": "rgba(0,0,0,0.45)",
      "text-halo-width": 0.8,
    },
  });
  markup({
    id: "map3d-arrows",
    type: "symbol",
    source: SRC_ARROWS,
    layout: {
      "icon-image": IMG_CHEVRON,
      "icon-rotate": ["get", "bearing"],
      // Lie flat on the road and turn with it, like painted arrows.
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: { "icon-opacity": 0.62, "icon-emissive-strength": 1 },
  });
  markup({
    id: "map3d-pit-ghost",
    type: "symbol",
    source: SRC_GHOST,
    layout: {
      "icon-image": ["concat", IMG_GHOST_PREFIX, ["get", "color"]],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["concat", "PIT P", ["to-string", ["get", "position"]]],
      "text-font": ["Inter Black"],
      "text-size": 7 * scale,
      "text-letter-spacing": 0.04,
      "text-anchor": "top-left",
      // 2D label sits at (9, 10) from the ghost centre; offsets are in ems.
      "text-offset": [9 / 7, 10 / 7 - 0.9],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "icon-emissive-strength": 1,
      "icon-occlusion-opacity": 1,
      "text-emissive-strength": 1,
      "text-occlusion-opacity": 1,
      "text-color": ["get", "color"],
      "text-halo-color": "rgba(0,0,0,0.55)",
      "text-halo-width": 0.6 * scale,
    },
  });
}

/** Make sure the ghost icon for `color` exists (one image per team colour). */
export function ensureGhostIcon(map: MapboxMap, color: string, scale: number): void {
  const id = `${IMG_GHOST_PREFIX}${color}`;
  if (map.hasImage(id)) return;
  addCanvasImage(map, id, 20 * scale, (c, unit) => drawPitGhost(c, unit, color), scale);
}

/** Toggle the enhanced-visuals markup layers. */
export function setOverlayVisibility(map: MapboxMap, { enhanced }: { enhanced: boolean }): void {
  for (const id of ENHANCED_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", enhanced ? "visible" : "none");
  }
}

/**
 * Colour the telemetry overlays; a null gradient hides that overlay. The
 * caller decides what's enabled (enhanced visuals, elevation setting).
 */
export function setOverlayGradients(
  map: MapboxMap,
  gradients: {
    heat: ExpressionSpecification | null;
    delta: ExpressionSpecification | null;
    elevation: ExpressionSpecification | null;
  },
): void {
  const apply = (id: string, gradient: ExpressionSpecification | null) => {
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", gradient ? "visible" : "none");
    if (gradient) map.setPaintProperty(id, "line-gradient", gradient);
  };
  apply(OVERLAY_LAYERS.heat, gradients.heat);
  apply(OVERLAY_LAYERS.delta, gradients.delta);
  apply(OVERLAY_LAYERS.elevation, gradients.elevation);
  apply(OVERLAY_LAYERS.elevationShadow, gradients.elevation);
}
