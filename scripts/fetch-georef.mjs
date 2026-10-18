/**
 * Build-time bake script: georeferences every baked circuit geometry so the 3D
 * (Mapbox) map can place F1-frame coordinates on the globe.
 *
 * Run after fetch-circuits.mjs / bake-gps-circuits.mjs (Node ≥ 23.6 — it
 * imports a .ts util directly):
 *   node scripts/fetch-georef.mjs [--latest]
 *
 * For each src/data/circuit-geometry/{circuitKey}-{year}.json it fits a
 * similarity transform (scale + rotation + translation, optional Y flip) from
 * the centerline onto a WGS84 trace from bacinger/f1-circuits (MIT), and
 * writes all fits to src/data/circuit-georef.json. Fits above the error gate
 * are left out, which hides the 3D view for that circuit.
 *
 * The reference trace is found automatically: every bacinger trace of a
 * similar length is tried and the closest fit wins, so new venues need no
 * code change once bacinger has them. `--latest` uses bacinger's newest
 * commit instead of the pinned one (the scheduled update job does this).
 *
 * Commit the generated JSON — it is a static asset.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fitClosedLoops, lngLatToEnu } from "../src/utils/georef.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOMETRY_DIR = join(__dirname, "../src/data/circuit-geometry");
const OUT_PATH = join(__dirname, "../src/data/circuit-georef.json");

// Pinned so a re-run is reproducible; `--latest` resolves the newest commit.
const PINNED_BACINGER_COMMIT = "8094e957b8d6aa8b9f4510c93968556cccd30e02";
const bacingerUrl = (ref) =>
  `https://raw.githubusercontent.com/bacinger/f1-circuits/${ref}/f1-circuits.geojson`;

// Reject fits whose centerline strays further than this from the reference
// trace (metres). An F1 track is ~12–15 m wide; the reference traces are
// hand-drawn, so a few metres of RMS is expected noise.
const MAX_RMS_M = 6;
const MAX_DEVIATION_M = 25;

/** Candidate traces must be within this ratio of the centerline's length. */
const LENGTH_TOLERANCE = 0.2;

/**
 * Manual circuit_key → bacinger id, only for when automatic matching picks
 * the wrong trace (e.g. two layouts of one venue). Normally empty.
 */
const BACINGER_OVERRIDES = {};

const round = (v, digits) => Number(v.toFixed(digits));

async function resolveCommit(latest) {
  if (!latest) return PINNED_BACINGER_COMMIT;
  const res = await fetch("https://api.github.com/repos/bacinger/f1-circuits/commits/master", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "f1-replay-bake" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} resolving bacinger master`);
  return (await res.json()).sha;
}

/** Bacinger trace in local metres around its own centroid. */
function referenceTrace(feature) {
  const coords = feature.geometry.coordinates;
  const originLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const originLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const pts = coords.map(([lng, lat]) => lngLatToEnu(originLng, originLat, lng, lat));
  return { id: feature.properties.id, originLng, originLat, pts, length: loopLength(pts) };
}

function loopLength(pts) {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * The bacinger trace that fits this centerline best: candidates of a similar
 * length (F1 units are ~decimetres) get a quick fit, the lowest RMS wins.
 */
function matchReference(src, references, override) {
  if (override) return references.find((r) => r.id === override) ?? null;
  const lengthM = loopLength(src) / 10;
  const candidates = references.filter(
    (r) => Math.abs(r.length - lengthM) / lengthM <= LENGTH_TOLERANCE,
  );
  let best = null;
  for (const ref of candidates) {
    const quick = fitClosedLoops(src, ref.pts, { samples: 96, icpIterations: 4, densify: 1024 });
    if (!best || quick.rmsNearest < best.rms) best = { ref, rms: quick.rmsNearest };
  }
  return best?.ref ?? null;
}

async function main() {
  const commit = await resolveCommit(process.argv.includes("--latest"));
  const url = bacingerUrl(commit);
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const references = (await res.json()).features
    .filter((f) => f.geometry?.type === "LineString")
    .map(referenceTrace);

  const files = readdirSync(GEOMETRY_DIR)
    .map((name) => /^(\d+)-(\d+)\.json$/.exec(name))
    .filter(Boolean)
    .map((m) => ({ name: m[0], circuitKey: Number(m[1]), year: Number(m[2]) }))
    .sort((a, b) => a.circuitKey - b.circuitKey || a.year - b.year);

  // One match per circuit, from its latest layout; every year then gets a
  // full fit against that trace (a layout change shows up as a high RMS).
  const latestByKey = new Map();
  for (const f of files) latestByKey.set(f.circuitKey, f);
  const matches = new Map();
  const load = (name) => JSON.parse(readFileSync(join(GEOMETRY_DIR, name), "utf8"));
  const centerline = (geom) => geom.x.map((x, i) => ({ x, y: geom.y[i] }));
  for (const [key, file] of latestByKey) {
    const geom = load(file.name);
    const ref = matchReference(centerline(geom), references, BACINGER_OVERRIDES[key]);
    matches.set(key, ref);
    console.log(`  match ${String(key).padEnd(4)} ${geom.circuitName.padEnd(20)} → ${ref?.id ?? "none"}`);
  }

  const circuits = {};
  const rejected = [];
  for (const { name, circuitKey, year } of files) {
    const ref = matches.get(circuitKey);
    if (!ref) {
      console.warn(`  SKIP ${name}: no reference trace of a similar length`);
      rejected.push(name);
      continue;
    }
    const geom = load(name);
    const fit = fitClosedLoops(centerline(geom), ref.pts);

    const summary = `${ref.id} scale=${fit.scale.toFixed(4)} rot=${((fit.rotation * 180) / Math.PI).toFixed(2)}° flipY=${fit.flipY} rms=${fit.rmsNearest.toFixed(1)}m max=${fit.maxNearest.toFixed(1)}m`;
    if (fit.rmsNearest > MAX_RMS_M || fit.maxNearest > MAX_DEVIATION_M) {
      console.warn(`  REJECT ${name} (${geom.circuitName}): ${summary}`);
      rejected.push(name);
      continue;
    }
    console.log(`  ${name.padEnd(14)} ${geom.circuitName.padEnd(20)} ${summary}`);

    circuits[`${circuitKey}-${year}`] = {
      originLng: round(ref.originLng, 7),
      originLat: round(ref.originLat, 7),
      scale: round(fit.scale, 7),
      rotation: round(fit.rotation, 7),
      flipY: fit.flipY,
      tx: round(fit.tx, 2),
      ty: round(fit.ty, 2),
      rmsM: round(fit.rmsNearest, 1),
      maxM: round(fit.maxNearest, 1),
      referenceId: ref.id,
    };
  }

  // Leave the file alone when no fit changed, so a new bacinger commit alone
  // (with --latest) doesn't produce a diff.
  const previous = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : null;
  if (previous && JSON.stringify(previous.circuits) === JSON.stringify(circuits)) {
    console.log(`\nUnchanged: ${Object.keys(circuits).length} georeferenced, ${rejected.length} skipped/rejected`);
    return;
  }
  const out = {
    source: `bacinger/f1-circuits@${commit} (MIT)`,
    circuits,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `\nDone: ${Object.keys(circuits).length} georeferenced, ${rejected.length} skipped/rejected`,
  );
  console.log("Commit src/data/circuit-georef.json to git.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
