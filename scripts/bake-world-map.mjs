/**
 * Build-time bake script: the land outline behind the schedule page's world
 * map, as one SVG path in the equirectangular frame of src/utils/worldMap.ts
 * (x = longitude + 180, y = 90 − latitude, in degrees).
 *
 * Source: Natural Earth 1:110m land (public domain) via the world-atlas
 * TopoJSON package. The TopoJSON is decoded here, so no extra dependency.
 *
 *   node scripts/bake-world-map.mjs
 *
 * Behind TLS inspection add `--use-system-ca` (Node ≥ 23.8).
 * Commit the generated JSON — it is a static asset that rarely changes.
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../src/data/world-land.json");
const SOURCE_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";
// Hundredths of a degree (~1 km) is finer than the 1:110m source detail.
const DECIMALS = 2;
const MIN_LAT = -60;

const round = (v) => {
  const f = 10 ** DECIMALS;
  return Math.round(v * f) / f;
};

// TopoJSON arcs are quantized and delta-encoded.
function decodeArcs(topology) {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function ringPoints(ring, arcs) {
  const points = [];
  for (const index of ring) {
    const arc = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
    // Consecutive arcs share their joining point.
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

function polygons(geometry) {
  if (geometry.type === "Polygon") return [geometry.arcs];
  if (geometry.type === "MultiPolygon") return geometry.arcs;
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(polygons);
  return [];
}

// Rings crossing the antimeridian (Chukotka, Fiji) jump ±360° between two
// points; unwrapping keeps them contiguous past the frame's edge, and a
// shifted copy fills the other edge.
function unwrapRing(points) {
  const out = [];
  let offset = 0;
  let prev = null;
  for (const [lng, lat] of points) {
    if (prev !== null) {
      const d = lng + offset - prev;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    prev = lng + offset;
    out.push([prev, lat]);
  }
  return out;
}

function ringCopies(points) {
  const unwrapped = unwrapRing(points);
  const lngs = unwrapped.map(([lng]) => lng);
  const copies = [unwrapped];
  if (Math.max(...lngs) > 180) copies.push(unwrapped.map(([lng, lat]) => [lng - 360, lat]));
  if (Math.min(...lngs) < -180) copies.push(unwrapped.map(([lng, lat]) => [lng + 360, lat]));
  return copies;
}

// Relative commands keep the path compact. Deltas are taken between rounded
// absolute points, so rounding never accumulates along a ring.
function ringToPath(points) {
  let out = "";
  let px = 0;
  let py = 0;
  let first = true;
  for (const [lng, lat] of points) {
    const x = round(lng + 180);
    const y = round(90 - lat);
    if (first) {
      out += `M${x} ${y}`;
      first = false;
    } else {
      const dx = round(x - px);
      const dy = round(y - py);
      if (dx === 0 && dy === 0) continue;
      out += `l${dx} ${dy}`;
    }
    px = x;
    py = y;
  }
  return out ? `${out}z` : "";
}

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`${SOURCE_URL}: HTTP ${res.status}`);
const topology = await res.json();
const arcs = decodeArcs(topology);

let path = "";
let rings = 0;
for (const polygon of polygons(topology.objects.land)) {
  for (const ring of polygon) {
    const points = ringPoints(ring, arcs);
    // Antarctica: wraps the pole and lies below the map's crop anyway.
    if (points.every(([, lat]) => lat < MIN_LAT)) continue;
    for (const copy of ringCopies(points)) {
      const d = ringToPath(copy);
      if (d) {
        path += d;
        rings += 1;
      }
    }
  }
}
if (!path.startsWith("M")) throw new Error("No land rings decoded");

writeFileSync(
  OUT_PATH,
  `${JSON.stringify(
    {
      source: "Natural Earth 1:110m land (public domain) via world-atlas@2.0.2",
      projection: "equirectangular: x = lng + 180, y = 90 - lat",
      path,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${rings} rings, ${path.length} chars → ${OUT_PATH}`);
