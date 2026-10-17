/**
 * Car markers for the 3D map, styled to match the 2D map's `CarMarker`.
 *
 * Every size here is in 2D SVG units, the same numbers `CarMarker` uses. Each
 * feature carries its own sizes as properties, and the layer specs multiply
 * them by `scale` (pixels per SVG unit), so at the same panel size a car looks
 * the same on both maps.
 */
import type { LayerSpecification } from "mapbox-gl";
import type { Driver, Stint } from "@/api/types";
import { SPECIAL_TRACK_VEHICLES } from "@/components/TrackMap/layers/specialVehicles";
import { mapBackgroundColor } from "@/components/TrackMap/trackMapFormat";
import {
  COMPOUND_COLORS,
  FOLLOW_ZOOM_W,
  MAP3D_HEADING_LOOKBACK_MS,
  MAP3D_MODEL_HEADING_OFFSET,
  MAP3D_MODEL_MIN_ZOOM,
  MAP3D_MODEL_NEAR_ZOOM,
  MAP3D_MODEL_SCALE_FAR,
  MAP3D_MODEL_SCALE_NEAR,
  SAFETY_CAR_NUMBERS,
  TRACK_FIT_ZOOM,
  TRACK_SVG_H,
  TRACK_SVG_W,
} from "@/constants";
import { isOffTrackPlaceholder } from "@/hooks/useTrackMap";
import { interpolateXY, type LocationIndex } from "@/timeline/interpolate";
import { teamColor } from "@/utils/color";
import { type CircuitGeoref, f1ToLngLat } from "@/utils/georef";
import { headingDeg, type FeatureCollection, type PointFeature } from "./mapFeatures";

const LABEL_X = 10;
const BATTLE_COLOR = "#ffd700";
const SAFETY_RING_COLOR = "#9aa4be";
const PULSE_PERIOD_MS = 800;
const SIREN_PERIOD_MS = 950;

export const CAR_SOURCE = "map3d-cars";
/** Id the CC0 car model (public/models/f1-car.glb) is registered under. */
export const CAR_MODEL_ID = "map3d-f1-car";
export const CAR_MODEL_LAYER = "map3d-car-models";
/** Clickable car dot layer. */
export const CAR_DOT_LAYER = "map3d-cars";
const PULSE_LAYER = "map3d-car-pulse";
const SIREN_LAYER = "map3d-car-siren";

export interface CarFeatureInput {
  indexes: ReadonlyMap<number, LocationIndex>;
  driverByNumber: ReadonlyMap<number, Driver>;
  focusDriver: number | null;
  battlingDrivers?: ReadonlySet<number>;
  retiredDrivers?: ReadonlySet<number>;
  pulseDrivers?: ReadonlySet<number>;
  activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  safetyCarSirenOn: boolean;
  showAcronym: boolean;
  showNumberInside: boolean;
  lightMode: boolean;
}

/** Pixels per SVG unit on the 2D map for a panel of this size (and follow state). */
export function carScaleFor(
  width: number,
  height: number,
  following = false,
): number {
  if (width <= 0 || height <= 0) return 1;
  const fit = Math.min(width / TRACK_SVG_W, height / TRACK_SVG_H) * TRACK_FIT_ZOOM;
  // The 2D follow camera narrows the viewBox to FOLLOW_ZOOM_W, which enlarges
  // every marker by the same factor.
  return following ? fit * (TRACK_SVG_W / FOLLOW_ZOOM_W) : fit;
}

/**
 * Car markers at playhead `t` (session-relative ms). Off-track placeholders
 * (x = y = 0) and retired cars are dropped, as on the 2D map.
 */
export function buildCarFeatures(
  geo: CircuitGeoref,
  t: number,
  input: CarFeatureInput,
): FeatureCollection<PointFeature> {
  const features: PointFeature[] = [];
  for (const [num, idx] of input.indexes) {
    if (input.retiredDrivers?.has(num)) continue;
    const pos = interpolateXY(idx, t);
    if (!pos || isOffTrackPlaceholder(pos)) continue;
    const prev = interpolateXY(idx, t - MAP3D_HEADING_LOOKBACK_MS);
    const heading = prev ? (headingDeg(geo, prev, pos) ?? 0) : 0;
    features.push({
      type: "Feature",
      properties: {
        ...carStyle(num, input),
        // Model yaw (degrees); the model layer reads it as [x, y, z].
        rotation: [0, 0, heading + MAP3D_MODEL_HEADING_OFFSET],
      },
      geometry: { type: "Point", coordinates: f1ToLngLat(geo, pos.x, pos.y) },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Per-car style in SVG units; mirrors `CarMarker` in the 2D `CarLayer`. */
/** One car's look, in 2D SVG units (see `CarMarker`). A type alias, not an
 * interface, so it fits GeoJSON's string-keyed `properties`. */
export type CarStyle = {
  num: number;
  focused: boolean;
  pulsing: boolean;
  siren: boolean;
  order: number;
  opacity: number;
  color: string;
  radius: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  haloRadius: number;
  haloColor: string;
  battleRadius: number;
  specialRingRadius: number;
  specialRingColor: string;
  safetyRingRadius: number;
  sirenBase: number;
  sirenColor: string;
  compoundColor: string;
  marker: string;
  markerSize: number;
  markerTextColor: string;
  showLabel: boolean;
  label: string;
  labelColor: string;
  labelSize: number;
};

export function carStyle(
  num: number,
  input: CarFeatureInput,
): CarStyle & { icon: string } {
  const driver = input.driverByNumber.get(num);
  const special = SPECIAL_TRACK_VEHICLES[num];
  const isSafetyCar = SAFETY_CAR_NUMBERS.has(num);
  const siren = isSafetyCar && input.safetyCarSirenOn;
  const focused = input.focusDriver === num;
  const dimmed = input.focusDriver !== null && !focused;
  const pulsing = input.pulseDrivers?.has(num) ?? false;
  const battling = input.battlingDrivers?.has(num) ?? false;
  const compound = input.activeCompounds?.get(num)?.compound;
  const color = special ? special.fill : teamColor(driver?.team_colour, "#ffffff");

  const dotRadius = input.showNumberInside
    ? focused
      ? 8
      : 6.6
    : focused
      ? 6.5
      : 4.5;
  const serviceRadius = focused ? dotRadius + 0.7 : dotRadius + 0.4;
  const markerTextColor = special
    ? input.lightMode
      ? special.text
      : (special.textDark ?? special.text)
    : "#ffffff";
  const showMarker = input.showNumberInside || special != null;

  const style: CarStyle = {
    num,
    focused,
    pulsing,
    siren,
    // Focused car on top, then special vehicles, then the field.
    order: focused ? 2 : special ? 1 : 0,
    opacity: dimmed ? 0.3 : 1,
    color,
    radius: special ? serviceRadius : dotRadius,
    stroke: special ? special.stroke : "#ffffff",
    strokeWidth: focused ? 1.6 : 1.2,
    strokeOpacity: focused ? 0.9 : 0.78,
    haloRadius: focused ? dotRadius + 2.5 : 0,
    haloColor: special ? special.halo : color,
    battleRadius: battling && !pulsing ? (focused ? 13 : 8) : 0,
    specialRingRadius: special ? serviceRadius + 1.8 : 0,
    specialRingColor: special?.stroke ?? "#000000",
    safetyRingRadius: isSafetyCar && !siren ? serviceRadius + 3.4 : 0,
    sirenBase: serviceRadius,
    sirenColor: special?.fill ?? "#f5a623",
    compoundColor: compound ? COMPOUND_COLORS[compound] : "",
    marker: special ? special.shortLabel : String(num),
    markerSize: !showMarker
      ? 0
      : special
        ? focused
          ? 4.1
          : 3.8
        : focused
          ? num >= 10
            ? 5.2
            : 5.8
          : 4.4,
    markerTextColor,
    showLabel: (input.focusDriver === null || focused) && input.showAcronym,
    label: special
      ? special.fullLabel
      : (driver?.name_acronym ?? String(num)),
    labelColor: special ? markerTextColor : color,
    labelSize: focused ? 9 : 8,
  };
  return { ...style, icon: carIconKey(style) };
}

/** Pulse ring (new event for this car): r 6 → 14, fading out. */
export function pulseFrame(nowMs: number) {
  const p = (nowMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  return { radius: 6 + 8 * p, opacity: 0.9 * (1 - p) };
}

/** Safety car siren ring: grows +2.4 → +5.8 → +2.4 around the dot. */
export function sirenFrame(nowMs: number) {
  const p = (nowMs % SIREN_PERIOD_MS) / SIREN_PERIOD_MS;
  const tri = p < 0.5 ? p * 2 : 2 - p * 2;
  return { grow: 2.4 + 3.4 * tri, opacity: 0.85 - 0.6 * tri };
}

const prop = (name: string) => ["get", name];
const scaled = (name: string, scale: number) => ["*", ["get", name], scale];

/** Style fields baked into a car's icon image (everything but dimming). */
const ICON_FIELDS = [
  "color",
  "radius",
  "stroke",
  "strokeWidth",
  "strokeOpacity",
  "haloRadius",
  "haloColor",
  "battleRadius",
  "specialRingRadius",
  "specialRingColor",
  "safetyRingRadius",
  "compoundColor",
  "focused",
  "marker",
  "markerSize",
  "markerTextColor",
] as const;

/** Image id for a car's look; cars that look the same share one image. */
export function carIconKey(style: CarStyle): string {
  // The number only matters to the image when it is drawn inside the dot.
  const fields = ICON_FIELDS.map((f) =>
    f === "marker" && style.markerSize === 0 ? "" : String(style[f]),
  );
  return `car3d|${fields.join("|")}`;
}

/** Half-width of the icon in SVG units: the outermost ring plus a margin. */
export function carIconExtent(style: CarStyle): number {
  const compound = style.compoundColor
    ? (style.focused ? 8 + 2.5 : 5 + 1.8) + 0.5
    : 0;
  return (
    Math.max(
      style.radius + style.strokeWidth,
      style.haloRadius + 1,
      style.battleRadius + 1,
      style.specialRingRadius + 1,
      style.safetyRingRadius + 1,
      compound,
    ) + 1
  );
}

/**
 * Paint one car marker exactly like the 2D `CarMarker` SVG: battle ring,
 * focus halo, special-vehicle rings, dot, number inside, compound badge.
 * `unit` is device pixels per SVG unit; the canvas must be square with side
 * `2 * carIconExtent(style) * unit`.
 */
export function drawCarIcon(
  ctx: CanvasRenderingContext2D,
  style: CarStyle,
  unit: number,
  lightMode: boolean,
): void {
  const c = carIconExtent(style) * unit;
  const ring = (
    r: number,
    color: string,
    width: number,
    opacity: number,
    dash?: [number, number],
  ) => {
    if (r <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * unit;
    ctx.setLineDash(dash ? dash.map((d) => d * unit) : []);
    ctx.beginPath();
    ctx.arc(c, c, r * unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  ring(style.battleRadius, BATTLE_COLOR, 1.5, 0.75, [3, 2]);
  ring(style.haloRadius, style.haloColor, 1.5, 0.5);
  ring(style.specialRingRadius, style.specialRingColor, 1.1, 0.8, [2.2, 1.6]);
  ring(style.safetyRingRadius, SAFETY_RING_COLOR, 0.9, 0.34);

  // Dot: fill, then a stroke whose opacity is separate from the fill's.
  ctx.beginPath();
  ctx.arc(c, c, style.radius * unit, 0, Math.PI * 2);
  ctx.fillStyle = style.color;
  ctx.fill();
  ring(style.radius, style.stroke, style.strokeWidth, style.strokeOpacity);

  const markerSize = style.markerSize;
  if (markerSize > 0) {
    ctx.save();
    ctx.font = `900 ${markerSize * unit}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.6 * unit;
    ctx.strokeStyle = "rgba(0,0,0,0.58)";
    ctx.strokeText(style.marker, c, c);
    ctx.fillStyle = style.markerTextColor;
    ctx.fillText(style.marker, c, c);
    ctx.restore();
  }

  if (style.compoundColor) {
    const offset = (style.focused ? 8 : 5) * unit;
    ctx.beginPath();
    ctx.arc(c + offset, c + offset, (style.focused ? 2.5 : 1.8) * unit, 0, Math.PI * 2);
    ctx.fillStyle = style.compoundColor;
    ctx.fill();
    ctx.lineWidth = 0.5 * unit;
    ctx.strokeStyle = mapBackgroundColor(lightMode);
    ctx.stroke();
  }
}

/** The slice of mapboxgl.Map the icon cache needs. */
export interface CarIconHost {
  hasImage(id: string): boolean;
  addImage(id: string, image: ImageData, options: { pixelRatio: number }): void;
  removeImage(id: string): void;
}

/**
 * Make sure every car in `cars` has its icon image on the map. Images are
 * drawn at device resolution for the current panel `scale`; call
 * `clearCarIcons` when the scale or theme changes.
 */
export function ensureCarIcons(
  host: CarIconHost,
  cars: FeatureCollection<PointFeature>,
  scale: number,
  lightMode: boolean,
  cache: Set<string>,
  pixelRatio = globalThis.devicePixelRatio || 1,
): void {
  for (const feature of cars.features) {
    const style = feature.properties as CarStyle & { icon: string };
    if (cache.has(style.icon)) continue;
    cache.add(style.icon);
    const unit = scale * pixelRatio;
    const side = Math.ceil(2 * carIconExtent(style) * unit);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    drawCarIcon(ctx, style, unit, lightMode);
    if (host.hasImage(style.icon)) host.removeImage(style.icon);
    host.addImage(style.icon, ctx.getImageData(0, 0, side, side), { pixelRatio });
  }
}

export function clearCarIcons(host: CarIconHost, cache: Set<string>): void {
  for (const id of cache) if (host.hasImage(id)) host.removeImage(id);
  cache.clear();
}

/**
 * Car layer stack, bottom to top: the animated pulse and siren rings (circle
 * layers, so they can be animated per frame), the car icons, then the acronym
 * labels. Icons and labels are symbols so 3D buildings and trees never hide a
 * car, matching the always-on-top 2D markers.
 */
export function buildCarLayers(scale: number, nowMs = 0): LayerSpecification[] {
  const pulse = pulseFrame(nowMs);
  const siren = sirenFrame(nowMs);
  const symbol = {
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "symbol-sort-key": prop("order"),
  };
  const ringPaint = {
    "circle-color": "rgba(0,0,0,0)",
    "circle-pitch-alignment": "viewport",
    "circle-pitch-scale": "viewport",
    "circle-emissive-strength": 1,
  };

  const layers: Record<string, unknown>[] = [
    {
      id: PULSE_LAYER,
      type: "circle",
      filter: ["==", prop("pulsing"), true],
      paint: {
        ...ringPaint,
        "circle-radius": pulse.radius * scale,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5 * scale,
        "circle-stroke-opacity": ["*", pulse.opacity, prop("opacity")],
      },
    },
    {
      id: SIREN_LAYER,
      type: "circle",
      filter: ["==", prop("siren"), true],
      paint: {
        ...ringPaint,
        "circle-radius": ["*", ["+", prop("sirenBase"), siren.grow], scale],
        "circle-stroke-color": prop("sirenColor"),
        "circle-stroke-width": 1.2 * scale,
        "circle-stroke-opacity": ["*", siren.opacity, prop("opacity")],
      },
    },
    {
      id: CAR_MODEL_LAYER,
      type: "model",
      minzoom: MAP3D_MODEL_MIN_ZOOM,
      layout: { "model-id": CAR_MODEL_ID },
      paint: {
        "model-type": "common-3d",
        "model-rotation": ["get", "rotation"],
        "model-scale": [
          "interpolate",
          ["linear"],
          ["zoom"],
          MAP3D_MODEL_MIN_ZOOM + 1,
          ["literal", [MAP3D_MODEL_SCALE_FAR, MAP3D_MODEL_SCALE_FAR, MAP3D_MODEL_SCALE_FAR]],
          MAP3D_MODEL_NEAR_ZOOM,
          ["literal", [MAP3D_MODEL_SCALE_NEAR, MAP3D_MODEL_SCALE_NEAR, MAP3D_MODEL_SCALE_NEAR]],
        ],
        "model-color": prop("color"),
        "model-color-mix-intensity": 0.7,
        "model-emissive-strength": 0.4,
        "model-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          MAP3D_MODEL_MIN_ZOOM,
          0,
          MAP3D_MODEL_MIN_ZOOM + 0.6,
          prop("opacity"),
        ],
        "model-cast-shadows": true,
      },
    },
    {
      id: CAR_DOT_LAYER,
      type: "symbol",
      layout: {
        ...symbol,
        "icon-image": prop("icon"),
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
      },
      paint: {
        // Hand over to the 3D model as it fades in.
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          MAP3D_MODEL_MIN_ZOOM,
          prop("opacity"),
          MAP3D_MODEL_MIN_ZOOM + 0.6,
          0,
        ],
        "icon-occlusion-opacity": prop("opacity"),
        "icon-emissive-strength": 1,
      },
    },
    {
      id: "map3d-car-labels",
      type: "symbol",
      filter: ["==", prop("showLabel"), true],
      layout: {
        ...symbol,
        "text-font": ["Inter Black"],
        "text-field": prop("label"),
        "text-size": scaled("labelSize", scale),
        "text-letter-spacing": 0.04,
        // 2D draws the label's baseline at (10, -7), or (10, -9) when focused.
        "text-anchor": "bottom-left",
        "text-offset": [
          "case",
          prop("focused"),
          ["literal", [LABEL_X / 9, -9 / 9 + 0.25]],
          ["literal", [LABEL_X / 8, -7 / 8 + 0.25]],
        ],
      },
      paint: {
        "text-color": prop("labelColor"),
        "text-opacity": prop("opacity"),
        "text-occlusion-opacity": prop("opacity"),
        "text-emissive-strength": 1,
        // The 2D map sits on a flat background; a faint halo keeps the
        // label readable over roads and buildings.
        "text-halo-color": "rgba(0,0,0,0.55)",
        "text-halo-width": 0.8,
      },
    },
  ];

  return layers.map(
    (layer) => ({ ...layer, source: CAR_SOURCE, slot: "top" }) as LayerSpecification,
  );
}

/** Per-frame paint updates for the animated rings. */
export function animatedCarPaint(
  scale: number,
  nowMs: number,
): Array<[layer: string, property: string, value: unknown]> {
  const pulse = pulseFrame(nowMs);
  const siren = sirenFrame(nowMs);
  return [
    [PULSE_LAYER, "circle-radius", pulse.radius * scale],
    [PULSE_LAYER, "circle-stroke-opacity", ["*", pulse.opacity, prop("opacity")]],
    [SIREN_LAYER, "circle-radius", ["*", ["+", prop("sirenBase"), siren.grow], scale]],
    [SIREN_LAYER, "circle-stroke-opacity", ["*", siren.opacity, prop("opacity")]],
  ];
}
