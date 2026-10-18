/**
 * Build-time bake script: derives each circuit's pit-lane path from a real
 * car's GPS trace through a pit stop (the baked MultiViewer geometry has no
 * pit lane) and writes src/data/pit-lanes.json, keyed by circuit_key.
 *
 * Run after fetch-circuits.mjs (Node ≥ 23.6 — it imports .ts utils directly):
 *   node --use-system-ca scripts/fetch-pit-lanes.mjs [--all]
 *
 * Without --all, circuits that already have a pit lane are kept as they are.
 *
 * Paced for OpenF1's free tier (3 req/s, 30 req/min). Commit the JSON.
 *
 * "fetch failed … unable to get local issuer certificate" means Node doesn't
 * trust a TLS-inspecting proxy's CA: add `--use-system-ca` (Node ≥ 23.8).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractPitLane } from "../src/utils/pitLane.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOMETRY_DIR = join(__dirname, "../src/data/circuit-geometry");
const OUT_PATH = join(__dirname, "../src/data/pit-lanes.json");
const OPENF1 = "https://api.openf1.org/v1";
const REQUEST_GAP_MS = 2_200;
/** Seasons to take a race from, in order of preference (newest venues last). */
const RACE_YEARS = [2025, 2024, 2023, 2026];
/** Stops to try per circuit before giving up. */
const MAX_ATTEMPTS = 3;
/** Window either side of the stop's `date` (OpenF1's isn't the entry time). */
const WINDOW_PAD_S = 45;

let lastRequest = 0;
async function get(path) {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  for (let attempt = 0; attempt < 4; attempt++) {
    lastRequest = Date.now();
    const res = await fetch(`${OPENF1}${path}`);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
      continue;
    }
    // OpenF1 answers 404 (not []) when a filter matches nothing.
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  }
  throw new Error(`Giving up on ${path}`);
}

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

const iso = (ms) => new Date(ms).toISOString();

async function pitLaneFor(circuitKey, geom) {
  for (const year of RACE_YEARS) {
    const sessions = await get(
      `/sessions?circuit_key=${circuitKey}&year=${year}&session_name=Race`,
    );
    const session = sessions.find((s) => !s.is_cancelled);
    if (!session) continue;

    const pits = (await get(`/pit?session_key=${session.session_key}`)).filter(
      (p) => p.lane_duration > 10 && p.lane_duration < 60,
    );
    if (pits.length === 0) continue;
    // Prefer typical stops: closest to the median lane time.
    const lanes = pits.map((p) => p.lane_duration).sort((a, b) => a - b);
    const median = lanes[Math.floor(lanes.length / 2)];
    pits.sort((a, b) => Math.abs(a.lane_duration - median) - Math.abs(b.lane_duration - median));

    for (const pit of pits.slice(0, MAX_ATTEMPTS)) {
      const at = Date.parse(pit.date);
      const from = iso(at - (pit.lane_duration + WINDOW_PAD_S) * 1000);
      const to = iso(at + (pit.lane_duration + WINDOW_PAD_S) * 1000);
      const rows = await get(
        `/location?session_key=${session.session_key}&driver_number=${pit.driver_number}&date>${from}&date<${to}`,
      );
      const trace = rows
        .filter((r) => r.x !== 0 || r.y !== 0)
        .map((r) => ({ t: Date.parse(r.date), x: r.x, y: r.y }));
      const lane = extractPitLane(trace, geom.x, geom.y, {
        minDurationMs: pit.lane_duration * 500,
      });
      if (lane) {
        return {
          sessionKey: session.session_key,
          driverNumber: pit.driver_number,
          x: lane.map((p) => p.x),
          y: lane.map((p) => p.y),
        };
      }
    }
  }
  return null;
}

async function main() {
  // Only fill circuits without a pit lane unless --all is passed.
  const rebuildAll = process.argv.includes("--all");
  const out = !rebuildAll && existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : {};
  for (const [circuitKey, { name }] of latestGeometries()) {
    if (out[circuitKey]) continue;
    const geom = JSON.parse(readFileSync(join(GEOMETRY_DIR, name), "utf8"));
    try {
      const lane = await pitLaneFor(circuitKey, geom);
      if (lane) {
        out[circuitKey] = lane;
        console.log(`  ${String(circuitKey).padEnd(4)} ${geom.circuitName.padEnd(20)} ${lane.x.length} pts (session ${lane.sessionKey}, #${lane.driverNumber})`);
      } else {
        console.warn(`  SKIP ${circuitKey} ${geom.circuitName}: no usable pit stop trace`);
      }
    } catch (e) {
      console.warn(`  SKIP ${circuitKey} ${geom.circuitName}: ${e.message}`);
    }
  }
  writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`);
  console.log(`\nDone: ${Object.keys(out).length} pit lanes. Commit src/data/pit-lanes.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
