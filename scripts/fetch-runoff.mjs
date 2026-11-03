/**
 * Build-time bake script: the 3D map's run-off look per circuit (gravel,
 * sand, tarmac, or a street circuit's walls), written to
 * src/data/circuit-runoff.json keyed by circuit_key.
 *
 * Entries marked "curated" are hand-picked and never touched. A circuit with
 * baked geometry but no entry (a new venue) is classified from OpenStreetMap
 * (Overpass) along its georeferenced centerline:
 *   - street share: lap within 8 m of a public road (not highway=raceway);
 *   - gravel share: lap with a sand / gravel area within 35 m.
 * Mostly on public roads → street (walls), unless it also has gravel traps
 * (a park circuit like Albert Park); otherwise gravel if any stretch has
 * traps, else tarmac. Such entries are marked "osm" with their metrics —
 * review them and promote to "curated" when they're right: OSM tagging is
 * patchy, and against the curated set (Nov 2026, `--report`) this matches 17
 * of 26 — it misses untagged gravel traps (Hungaroring, Catalunya), purpose-
 * built street circuits not mapped as public roads (Jeddah, Miami, Madring)
 * and park circuits without mapped gravel (Melbourne, Montreal). If Overpass is
 * unreachable the circuit gets provisional gravel marked "default", retried
 * on the next run, so the workflow never blocks on OSM.
 *
 * Run after fetch-georef.mjs (Node ≥ 23.6 — it imports .ts utils directly):
 *   node --use-system-ca scripts/fetch-runoff.mjs [--all] [--report]
 *
 *   --all     re-classify "osm" entries too (curated ones are kept)
 *   --report  classify every circuit and compare with its entry; writes nothing
 *   --only=22,23  limit to these circuit keys
 *
 * "fetch failed … unable to get local issuer certificate" means Node doesn't
 * trust a TLS-inspecting proxy's CA: add `--use-system-ca` (Node ≥ 23.8).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { enuToLngLat, f1ToEnu, lngLatToEnu } from "../src/utils/georef.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOMETRY_DIR = join(__dirname, "../src/data/circuit-geometry");
const GEOREF_PATH = join(__dirname, "../src/data/circuit-georef.json");
const OUT_PATH = join(__dirname, "../src/data/circuit-runoff.json");
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const REQUEST_GAP_MS = 5_000;
/** Centerline sample spacing (m). */
const SAMPLE_M = 10;
/** A sample is "on a public road" within this distance of one (m). */
const ROAD_NEAR_M = 8;
/** A sample "has gravel" with a sand / gravel area within this distance (m). */
const GRAVEL_NEAR_M = 35;
/** Share of the lap on public roads that makes a street circuit. */
const STREET_SHARE = 0.5;
/** Gravel share that keeps a mostly-public-road circuit a park circuit (gravel). */
const PARK_GRAVEL_SHARE = 0.1;
/** Gravel share that makes a permanent circuit gravel rather than tarmac (Shanghai and Bahrain's nearby sand/lots read 0.08). */
const GRAVEL_SHARE = 0.1;
/** The Overpass query follows the centerline through points this far apart (m). */
const QUERY_STEP_M = 25;

const PUBLIC_ROAD =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$";

const args = new Set(process.argv.slice(2));
const ALL = args.has("--all");
const REPORT = args.has("--report");
const ONLY = new Set(
  (process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? []).map(Number),
);

const round = (v, digits) => Number(v.toFixed(digits));

/** Latest baked geometry per circuit key. */
function latestGeometries() {
  const byKey = new Map();
  for (const name of readdirSync(GEOMETRY_DIR)) {
    const m = /^(\d+)-(\d+)\.json$/.exec(name);
    if (!m) continue;
    const [key, year] = [Number(m[1]), Number(m[2])];
    if (!byKey.has(key) || byKey.get(key).year < year) byKey.set(key, { year, name });
  }
  return [...byKey.entries()].sort((a, b) => a[0] - b[0]);
}

let lastRequest = 0;
async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = lastRequest + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "f1-replay circuit bake (github.com/vargamateistvan/f1-replay)",
        },
      });
      // Busy servers answer 429/504 or an HTML error page.
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) return await res.json();
      console.warn(`  Overpass ${res.status} from ${new URL(url).host}, retrying…`);
    } catch (e) {
      console.warn(`  Overpass ${e.message}, retrying…`);
    }
    await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
  }
  throw new Error("Overpass unavailable");
}

/** Resample a closed polyline every `step` metres. */
function resampleLoop(pts, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = carry;
    while (d < len) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insidePolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Share of samples within `maxD` of any polyline (or inside any closed ring). */
function shareNear(samples, lines, maxD, areas = false) {
  let hits = 0;
  for (const p of samples) {
    const near = lines.some((line) => {
      if (areas && insidePolygon(p, line)) return true;
      for (let i = 0; i < line.length - 1; i++) {
        if (segmentDistance(p, line[i], line[i + 1]) <= maxD) return true;
      }
      return false;
    });
    if (near) hits++;
  }
  return hits / samples.length;
}

function classify({ streetShare, gravelShare }) {
  if (streetShare >= STREET_SHARE) return gravelShare >= PARK_GRAVEL_SHARE ? "gravel" : "street";
  return gravelShare >= GRAVEL_SHARE ? "gravel" : "tarmac";
}

async function measure(geom, geo) {
  const center = geom.x.map((x, i) => f1ToEnu(geo, x, geom.y[i]));
  const samples = resampleLoop(center, SAMPLE_M);
  // Only what lies near the lap (a whole city block box is a heavy query).
  const path = resampleLoop(center, QUERY_STEP_M)
    .map((p) => enuToLngLat(geo.originLng, geo.originLat, p.x, p.y))
    .map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join(",");
  const road = `around:${ROAD_NEAR_M + QUERY_STEP_M / 2},${path}`;
  const gravel = `around:${GRAVEL_NEAR_M + QUERY_STEP_M / 2},${path}`;
  const data = await overpass(`[out:json][timeout:120];
(
  way(${road})[highway~"${PUBLIC_ROAD}"];
  way(${gravel})[natural=sand];
  way(${gravel})[surface~"^(gravel|sand|fine_gravel|pebblestone)$"][!highway][!amenity];
);
out geom;`);
  const local = (way) =>
    (way.geometry ?? []).map((n) => lngLatToEnu(geo.originLng, geo.originLat, n.lon, n.lat));
  const roads = data.elements.filter((e) => e.tags?.highway).map(local);
  const areas = data.elements.filter((e) => !e.tags?.highway).map(local);
  return {
    streetShare: round(shareNear(samples, roads, ROAD_NEAR_M), 2),
    gravelShare: round(shareNear(samples, areas, GRAVEL_NEAR_M, true), 2),
  };
}

async function main() {
  const georefs = JSON.parse(readFileSync(GEOREF_PATH, "utf8")).circuits;
  const out = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, "utf8"))
    : {
        source: "Hand-picked, or classified from © OpenStreetMap contributors (ODbL) by scripts/fetch-runoff.mjs",
        circuits: {},
      };
  const changes = [];
  for (const [key, { year, name }] of latestGeometries()) {
    if (ONLY.size && !ONLY.has(key)) continue;
    const entry = out.circuits[key];
    const needs =
      REPORT || !entry || entry.source === "default" || (ALL && entry.source === "osm");
    if (!needs) continue;
    const geo = georefs[`${key}-${year}`];
    if (!geo) {
      console.warn(`${name}: no georeference (3D map hidden), skipped`);
      continue;
    }
    const geom = JSON.parse(readFileSync(join(GEOMETRY_DIR, name), "utf8"));
    const label = `${key} ${geom.circuitName ?? ""}`.trim();
    const named = { name: geom.circuitName ?? `circuit ${key}` };
    let metrics;
    try {
      metrics = await measure(geom, geo);
    } catch (e) {
      console.warn(`${label}: ${e.message}`);
      if (REPORT || entry) continue;
      out.circuits[key] = { ...named, surface: "gravel", source: "default" };
      changes.push(`${label}: gravel (provisional — OpenStreetMap unavailable, retried next run)`);
      continue;
    }
    const surface = classify(metrics);
    if (REPORT) {
      const known = entry?.surface ?? "—";
      const mark = known === surface ? "✓" : "✗";
      console.log(
        `${mark} ${label.padEnd(26)} street ${metrics.streetShare.toFixed(2)}  gravel ${metrics.gravelShare.toFixed(2)}  → ${surface.padEnd(6)} (entry: ${known}${entry ? `, ${entry.source}` : ""})`,
      );
      continue;
    }
    out.circuits[key] = { ...named, surface, source: "osm", ...metrics };
    changes.push(`${label}: ${surface} (street ${metrics.streetShare}, gravel ${metrics.gravelShare})`);
    console.log(`${label}: ${surface}`, metrics);
  }
  if (REPORT) return;
  if (!changes.length) {
    console.log("Every circuit has a run-off entry.");
    return;
  }
  out.circuits = Object.fromEntries(
    Object.entries(out.circuits).sort((a, b) => Number(a[0]) - Number(b[0])),
  );
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${OUT_PATH}:\n  ${changes.join("\n  ")}`);
}

await main();
