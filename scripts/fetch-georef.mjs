/**
 * Build-time bake script: georeferences every baked circuit geometry so the 3D
 * (Mapbox) map can place F1-frame coordinates on the globe.
 *
 * Run after fetch-circuits.mjs (Node ≥ 23.6 — it imports a .ts util directly):
 *   node scripts/fetch-georef.mjs
 *
 * For each src/data/circuit-geometry/{circuitKey}-{year}.json it fits a
 * similarity transform (scale + rotation + translation, optional Y flip) from
 * the MultiViewer centerline onto the matching WGS84 trace from
 * bacinger/f1-circuits (MIT), and writes all fits to
 * src/data/circuit-georef.json. Fits above the error gate are left out, which
 * hides the 3D view for that circuit.
 *
 * Commit the generated JSON — it is a static asset.
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fitClosedLoops, lngLatToEnu } from "../src/utils/georef.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOMETRY_DIR = join(__dirname, "../src/data/circuit-geometry");
const OUT_PATH = join(__dirname, "../src/data/circuit-georef.json");

// Pinned so re-running the bake is reproducible.
const BACINGER_COMMIT = "8094e957b8d6aa8b9f4510c93968556cccd30e02";
const BACINGER_URL = `https://raw.githubusercontent.com/bacinger/f1-circuits/${BACINGER_COMMIT}/f1-circuits.geojson`;

// Reject fits whose centerline strays further than this from the reference
// trace (metres). An F1 track is ~12–15 m wide; the reference traces are
// hand-drawn, so a few metres of RMS is expected noise.
const MAX_RMS_M = 6;
const MAX_DEVIATION_M = 25;

/** OpenF1 / MultiViewer circuit_key → bacinger/f1-circuits feature id. */
const BACINGER_IDS = {
  2: "gb-1948", // Silverstone
  4: "hu-1986", // Hungaroring
  6: "it-1953", // Imola
  7: "be-1925", // Spa-Francorchamps
  9: "us-2012", // Austin
  10: "au-1953", // Melbourne
  14: "br-1940", // Interlagos
  15: "es-1991", // Catalunya
  19: "at-1969", // Spielberg
  22: "mc-1929", // Monte Carlo
  23: "ca-1978", // Montreal
  39: "it-1922", // Monza
  46: "jp-1962", // Suzuka
  49: "cn-2004", // Shanghai
  55: "nl-1948", // Zandvoort
  61: "sg-2008", // Singapore
  63: "bh-2002", // Sakhir
  65: "mx-1962", // Mexico City
  70: "ae-2009", // Yas Marina
  144: "az-2016", // Baku
  149: "sa-2021", // Jeddah
  150: "qa-2004", // Losail
  151: "us-2022", // Miami
  152: "us-2023", // Las Vegas
};

const round = (v, digits) => Number(v.toFixed(digits));

async function main() {
  console.log(`Fetching ${BACINGER_URL}`);
  const res = await fetch(BACINGER_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${BACINGER_URL}`);
  const collection = await res.json();
  const features = new Map(
    collection.features.map((f) => [f.properties.id, f]),
  );

  const files = readdirSync(GEOMETRY_DIR)
    .map((name) => /^(\d+)-(\d+)\.json$/.exec(name))
    .filter(Boolean)
    .map((m) => ({ name: m[0], circuitKey: Number(m[1]), year: Number(m[2]) }))
    .sort((a, b) => a.circuitKey - b.circuitKey || a.year - b.year);

  const circuits = {};
  const rejected = [];
  for (const { name, circuitKey, year } of files) {
    const id = BACINGER_IDS[circuitKey];
    const feature = id ? features.get(id) : undefined;
    if (!feature || feature.geometry.type !== "LineString") {
      console.warn(`  SKIP ${name}: no reference trace`);
      rejected.push(name);
      continue;
    }

    const coords = feature.geometry.coordinates;
    const originLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const originLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    const dst = coords.map(([lng, lat]) =>
      lngLatToEnu(originLng, originLat, lng, lat),
    );

    const geom = JSON.parse(readFileSync(join(GEOMETRY_DIR, name), "utf8"));
    const src = geom.x.map((x, i) => ({ x, y: geom.y[i] }));
    const fit = fitClosedLoops(src, dst);

    const summary = `scale=${fit.scale.toFixed(4)} rot=${((fit.rotation * 180) / Math.PI).toFixed(2)}° flipY=${fit.flipY} rms=${fit.rmsNearest.toFixed(1)}m max=${fit.maxNearest.toFixed(1)}m`;
    if (fit.rmsNearest > MAX_RMS_M || fit.maxNearest > MAX_DEVIATION_M) {
      console.warn(`  REJECT ${name} (${geom.circuitName}): ${summary}`);
      rejected.push(name);
      continue;
    }
    console.log(`  ${name.padEnd(14)} ${geom.circuitName.padEnd(20)} ${summary}`);

    circuits[`${circuitKey}-${year}`] = {
      originLng: round(originLng, 7),
      originLat: round(originLat, 7),
      scale: round(fit.scale, 7),
      rotation: round(fit.rotation, 7),
      flipY: fit.flipY,
      tx: round(fit.tx, 2),
      ty: round(fit.ty, 2),
      rmsM: round(fit.rmsNearest, 1),
      maxM: round(fit.maxNearest, 1),
    };
  }

  const out = {
    source: `bacinger/f1-circuits@${BACINGER_COMMIT} (MIT)`,
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
