/**
 * Build-time bake for circuits MultiViewer has no geometry for (new venues
 * such as Madring): derives the centerline from the fastest clean race lap's
 * GPS trace on OpenF1 and writes src/data/circuit-geometry/{key}-{year}.json
 * in the same shape as fetch-circuits.mjs (with `source: "openf1-gps"` and no
 * corners or marshal sectors).
 *
 * Only circuits from the given season's races with no baked file at all are
 * written. Run after fetch-circuits.mjs, then fetch-georef.mjs and
 * fetch-pit-lanes.mjs:
 *   node --use-system-ca scripts/bake-gps-circuits.mjs [year]
 *
 * Paced for OpenF1's free tier (3 req/s, 30 req/min). Commit the JSON.
 */

import { readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../src/data/circuit-geometry");
const OPENF1 = "https://api.openf1.org/v1";
const REQUEST_GAP_MS = 2_200;
/** A usable lap trace has at least this many samples (~3.7 Hz × 60 s). */
const MIN_SAMPLES = 150;
/** Start and end of the lap must meet within this (F1 units = decimetres). */
const MAX_CLOSE_GAP = 600;

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
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  }
  throw new Error(`Giving up on ${path}`);
}

const iso = (ms) => new Date(ms).toISOString();

async function lapTrace(session) {
  const laps = (await get(`/laps?session_key=${session.session_key}`))
    .filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap && l.lap_number > 1)
    .sort((a, b) => a.lap_duration - b.lap_duration);
  // Fastest first; fall back to the next few if a trace has gaps.
  for (const lap of laps.slice(0, 5)) {
    const start = Date.parse(lap.date_start);
    const rows = await get(
      `/location?session_key=${session.session_key}&driver_number=${lap.driver_number}` +
        `&date>${iso(start)}&date<${iso(start + lap.lap_duration * 1000)}`,
    );
    const pts = rows
      .filter((r) => r.x !== 0 || r.y !== 0)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (pts.length < MIN_SAMPLES) continue;
    const gap = Math.hypot(pts[0].x - pts.at(-1).x, pts[0].y - pts.at(-1).y);
    if (gap > MAX_CLOSE_GAP) continue;
    return { lap, x: pts.map((p) => p.x), y: pts.map((p) => p.y) };
  }
  return null;
}

async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const baked = new Set(
    readdirSync(OUT_DIR)
      .map((f) => /^(\d+)-\d+\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  const races = (await get(`/sessions?year=${year}&session_name=Race`)).filter(
    (s) => !s.is_cancelled && Date.parse(s.date_end) < Date.now(),
  );
  let written = 0;
  for (const session of races) {
    if (baked.has(session.circuit_key)) continue;
    const trace = await lapTrace(session);
    if (!trace) {
      console.warn(`  SKIP ${session.circuit_key} ${session.circuit_short_name}: no clean lap trace`);
      continue;
    }
    const geometry = {
      circuitKey: session.circuit_key,
      circuitName: session.circuit_short_name,
      year,
      source: "openf1-gps",
      rotation: 0,
      x: trace.x,
      y: trace.y,
      corners: [],
      marshalSectors: [],
      marshalLights: [],
    };
    const out = join(OUT_DIR, `${session.circuit_key}-${year}.json`);
    writeFileSync(out, JSON.stringify(geometry, null, 2));
    baked.add(session.circuit_key);
    written++;
    console.log(
      `  ${session.circuit_key} ${session.circuit_short_name}: ${trace.x.length} pts from #${trace.lap.driver_number} lap ${trace.lap.lap_number} (${trace.lap.lap_duration}s) → ${out}`,
    );
  }
  console.log(`\nDone: ${written} written. Next: fetch-georef.mjs, fetch-pit-lanes.mjs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
