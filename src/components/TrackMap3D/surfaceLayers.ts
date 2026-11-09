/**
 * Mapbox fill layers for the real-width track surface (see trackSurface.ts),
 * coloured per Standard light preset.
 */
import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import {
  FLAG_COLORS,
  MAP3D_EDGE_LINE_COLOR,
  MAP3D_KERB_COLORS,
  MAP3D_RUNOFF_PALETTE,
  MAP3D_SECTOR_RIBBON_M,
  MAP3D_SURFACE_MIN_ZOOM,
  MAP3D_TRACK_HALF_WIDTH_M,
  MAP3D_TRACK_PALETTE,
  MAP3D_TRACK_WET_PALETTE,
} from "@/constants";
import type { RunoffStyle } from "@/data/circuitRunoff";
import type { AppSettings } from "@/stores/settings";
import { isActiveTrackFlag, type TimingSectorFlags } from "@/timeline/raceControl";
import type { LightPreset } from "./atmosphere";
import { groundWidthExpression } from "./mapFeatures";
import type { SectorZones, TrackSurface } from "./trackSurface";

const LAYERS = {
  grass: "map3d-surface-grass",
  grassStripes: "map3d-surface-grass-stripes",
  runoff: "map3d-surface-runoff",
  runoffBands: "map3d-surface-runoff-bands",
  verge: "map3d-surface-verge",
  pitLane: "map3d-surface-pit-lane",
  pitLaneLines: "map3d-surface-pit-lane-lines",
  track: "map3d-surface-track",
  edgeLines: "map3d-surface-edge-lines",
  kerbsBase: "map3d-surface-kerbs-base",
  kerbsStripes: "map3d-surface-kerbs-stripes",
  gridSlots: "map3d-surface-grid-slots",
  startBase: "map3d-surface-start-base",
  startSquares: "map3d-surface-start-squares",
} as const;

/** Layout visibility stays independent of lighting and wet-track paint updates. */
export function setTrackSurfaceVisibility(
  map: MapboxMap,
  settings: Pick<AppSettings, "mapView3dKerbs" | "mapView3dRunoff">,
): void {
  for (const [ids, enabled] of [
    [[LAYERS.kerbsBase, LAYERS.kerbsStripes], settings.mapView3dKerbs],
    [[LAYERS.runoff, LAYERS.runoffBands], settings.mapView3dRunoff],
  ] as const) {
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
    }
  }
}

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
export function surfacePaint(
  preset: LightPreset,
  wet = false,
  runoffSurface: RunoffStyle["surface"] = "gravel",
): Record<string, { color: string | ExpressionSpecification; opacity: number; emissive: number }> {
  const p = MAP3D_TRACK_PALETTE[preset];
  const asphalt = wet ? MAP3D_TRACK_WET_PALETTE[preset] : p;
  const [kerbBase, kerbStripe] = MAP3D_KERB_COLORS;
  return {
    [LAYERS.grass]: { color: p.grass, opacity: 1, emissive: p.emissive },
    [LAYERS.grassStripes]: { color: p.grassStripe, opacity: 1, emissive: p.emissive },
    [LAYERS.runoff]: {
      // Street circuits draw no run-off; any colour will do.
      color: MAP3D_RUNOFF_PALETTE[runoffSurface === "street" ? "gravel" : runoffSurface][preset][
        wet ? "wet" : "dry"
      ],
      opacity: 1,
      emissive: p.emissive,
    },
    // Each painted band carries its own colour.
    [LAYERS.runoffBands]: { color: ["get", "color"], opacity: 0.9, emissive: p.emissive },
    [LAYERS.verge]: { color: p.casing, opacity: p.casingOpacity, emissive: p.emissive },
    [LAYERS.pitLane]: { color: asphalt.surface, opacity: 1, emissive: asphalt.emissive },
    [LAYERS.pitLaneLines]: { color: MAP3D_EDGE_LINE_COLOR, opacity: 0.9, emissive: p.emissive },
    [LAYERS.track]: { color: asphalt.surface, opacity: 1, emissive: asphalt.emissive },
    [LAYERS.edgeLines]: { color: MAP3D_EDGE_LINE_COLOR, opacity: 0.9, emissive: p.emissive },
    [LAYERS.kerbsBase]: { color: kerbBase, opacity: 1, emissive: p.emissive },
    [LAYERS.kerbsStripes]: { color: kerbStripe, opacity: 1, emissive: p.emissive },
    [LAYERS.gridSlots]: { color: MAP3D_EDGE_LINE_COLOR, opacity: 0.95, emissive: p.emissive },
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
  runoffSurface: RunoffStyle["surface"] = "gravel",
): void {
  const paint = surfacePaint(preset, false, runoffSurface);
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
  add("grass");
  add("grassStripes");
  add("runoff");
  add("runoffBands");
  add("verge");
  add("pitLane");
  add("pitLaneLines");
  add("track");
  add("edgeLines");
  add("kerbsBase");
  add("kerbsStripes");
  add("gridSlots");
  add("startBase");
  add("startSquares");
}

/** Recolour the surface for a new light preset. */
export function applyTrackPalette(
  map: MapboxMap,
  preset: LightPreset,
  wet = false,
  runoffSurface: RunoffStyle["surface"] = "gravel",
): void {
  for (const [id, p] of Object.entries(surfacePaint(preset, wet, runoffSurface))) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "fill-color", p.color);
    map.setPaintProperty(id, "fill-opacity", fadeIn(p.opacity));
    map.setPaintProperty(id, "fill-emissive-strength", p.emissive);
  }
}

const SECTOR_SOURCES = {
  ribbon: "map3d-sector-ribbon",
  paint: "map3d-sector-paint",
  lines: "map3d-sector-lines",
} as const;
const SECTOR_RIBBON_LAYERS = ["map3d-sector-ribbon", "map3d-sector-ribbon-line"] as const;

const isActive: ExpressionSpecification = ["boolean", ["feature-state", "active"], false];
const stateColor: ExpressionSpecification = [
  "coalesce",
  ["feature-state", "color"],
  FLAG_COLORS.CLEAR!,
];

/**
 * The 2D map's sector flag colours, per timing sector:
 * - condition ribbon: a band under the asphalt, green when
 *   clear and the flag colour when flagged (2D opacity 0.24 / 0.5);
 * - sector paint: a wash over the asphalt of a flagged sector;
 * - zoomed out, both as wide lines along the centerline.
 * Feature ids are the sector number (see `buildSectorZones`).
 */
export function addSectorLayers(
  map: MapboxMap,
  zones: SectorZones,
  lat: number,
  layout: { ribbonBefore: string; ribbonLineBefore: string; paintBefore: string },
): void {
  map.addSource(SECTOR_SOURCES.ribbon, { type: "geojson", data: zones.ribbon });
  map.addSource(SECTOR_SOURCES.paint, { type: "geojson", data: zones.paint });
  map.addSource(SECTOR_SOURCES.lines, { type: "geojson", data: zones.lines });
  const ribbonOpacity: ExpressionSpecification = ["case", isActive, 0.5, 0.24];
  const paintOpacity: ExpressionSpecification = ["case", isActive, 0.35, 0];

  map.addLayer(
    {
      id: "map3d-sector-ribbon",
      type: "fill",
      source: SECTOR_SOURCES.ribbon,
      slot: "middle",
      minzoom: MAP3D_SURFACE_MIN_ZOOM - 0.5,
      paint: {
        "fill-emissive-strength": 0.8,
        "fill-color": stateColor,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          MAP3D_SURFACE_MIN_ZOOM - 0.5,
          0,
          MAP3D_SURFACE_MIN_ZOOM,
          ribbonOpacity,
        ],
      },
    },
    layout.ribbonBefore,
  );
  map.addLayer(
    {
      id: "map3d-sector-ribbon-line",
      type: "line",
      source: SECTOR_SOURCES.lines,
      slot: "middle",
      layout: { "line-join": "round", "line-cap": "butt" },
      paint: {
        "line-emissive-strength": 0.8,
        "line-color": stateColor,
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          MAP3D_SURFACE_MIN_ZOOM - 0.5,
          ribbonOpacity,
          MAP3D_SURFACE_MIN_ZOOM,
          0,
        ],
        "line-width": groundWidthExpression(
          2 * (MAP3D_TRACK_HALF_WIDTH_M + MAP3D_SECTOR_RIBBON_M),
          lat,
          5,
        ),
      },
    },
    layout.ribbonLineBefore,
  );
  map.addLayer(
    {
      id: "map3d-sector-paint",
      type: "fill",
      source: SECTOR_SOURCES.paint,
      slot: "middle",
      minzoom: MAP3D_SURFACE_MIN_ZOOM - 0.5,
      paint: {
        "fill-emissive-strength": 0.8,
        "fill-color": stateColor,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          MAP3D_SURFACE_MIN_ZOOM - 0.5,
          0,
          MAP3D_SURFACE_MIN_ZOOM,
          paintOpacity,
        ],
      },
    },
    layout.paintBefore,
  );
}

/** Recolour the three sectors from the projected timing-sector flags. */
export function applySectorFlags(map: MapboxMap, flags: TimingSectorFlags): void {
  if (!map.getSource(SECTOR_SOURCES.paint)) return;
  for (const sector of [1, 2, 3] as const) {
    const flag = flags[sector];
    const active = isActiveTrackFlag(flag);
    const color = (active && flag ? FLAG_COLORS[flag] : null) ?? FLAG_COLORS.CLEAR!;
    for (const source of Object.values(SECTOR_SOURCES)) {
      map.setFeatureState(
        { source, id: sector },
        { active: active && color !== FLAG_COLORS.CLEAR, color },
      );
    }
  }
}

/** The always-on ribbon follows the standard track detail, as in 2D. */
export function setSectorRibbonVisibility(map: MapboxMap, visible: boolean): void {
  for (const id of SECTOR_RIBBON_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}
