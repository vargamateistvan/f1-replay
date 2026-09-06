/**
 * Build-time bake script: pulls official circuit geometry from the MultiViewer
 * API and writes one JSON file per circuit key into src/data/circuit-geometry/.
 *
 * Run once (or when a new season adds circuits):
 *   node scripts/fetch-circuits.mjs
 *
 * Commit the generated JSON files — they are static assets, not secrets.
 *
 * MultiViewer circuit API:
 *   GET https://api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}
 *
 * The x[], y[] coordinates are in the same F1 Cartesian space as the OpenF1
 * /location endpoint, so car positions overlay directly without any transform.
 */

import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../src/data/circuit-geometry");
const OPENF1_BASE = "https://api.openf1.org/v1";
const MV_BASE = "https://api.multiviewer.app/api/v1";

/** Fetch with basic retry on 429 / 5xx */
async function fetchJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "f1-replay-bake/1.0" },
    });
    if (res.status === 429 || res.status >= 500) {
      const delay = (attempt + 1) * 2000;
      console.warn(`  ${res.status} on ${url} — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Giving up on ${url} after retries`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Collect all unique {circuit_key, year} pairs across 2023–present
  // We keep EVERY year so that circuits with layout changes (e.g. Yas Marina 2021,
  // Albert Park 2022) are stored per-year and the app can pick the correct version.
  const firstYear = 2023;
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );
  const circuitYearPairs = new Set(); // "circuit_key-year" strings

  for (const year of years) {
    console.log(`Fetching sessions for ${year}…`);
    let sessions;
    try {
      sessions = await fetchJSON(`${OPENF1_BASE}/sessions?year=${year}`);
    } catch (e) {
      console.warn(`  Skipping ${year}: ${e.message}`);
      continue;
    }
    for (const s of sessions) {
      if (!s.circuit_key) continue;
      circuitYearPairs.add(`${s.circuit_key}-${s.year}`);
    }
    await new Promise((r) => setTimeout(r, 400)); // be gentle on the rate limit
  }

  // OpenF1 can require authentication while live coverage is active. Retain the
  // existing tracked pairs in that case so the public MultiViewer geometry can
  // still be refreshed without losing the circuit inventory.
  if (circuitYearPairs.size === 0) {
    for (const fileName of readdirSync(OUT_DIR)) {
      const match = /^(\d+)-(\d+)\.json$/.exec(fileName);
      if (match) circuitYearPairs.add(`${match[1]}-${match[2]}`);
    }
    console.warn(
      `OpenF1 returned no circuit pairs; reusing ${circuitYearPairs.size} existing baked pairs.`,
    );
  }

  // Sort so output is deterministic
  const pairs = [...circuitYearPairs]
    .map((key) => {
      const [ck, yr] = key.split("-");
      return { circuitKey: Number(ck), year: Number(yr) };
    })
    .sort((a, b) => a.circuitKey - b.circuitKey || a.year - b.year);

  console.log(`Found ${pairs.length} circuit-year pairs`);

  // 2. Fetch MultiViewer geometry for each {circuit_key, year}
  let ok = 0,
    skipped = 0;
  for (const { circuitKey, year } of pairs) {
    console.log(`  circuit_key=${circuitKey} year=${year}`);
    let data;
    try {
      data = await fetchJSON(`${MV_BASE}/circuits/${circuitKey}/${year}`);
    } catch (e) {
      // Try the previous year as fallback
      try {
        data = await fetchJSON(`${MV_BASE}/circuits/${circuitKey}/${year - 1}`);
        console.log(`    fell back to ${year - 1}`);
      } catch {
        console.warn(`    SKIP: ${e.message}`);
        skipped++;
        continue;
      }
    }

    // Keep the public geometry and operational metadata that the app can use.
    // DRS zones are not present in MultiViewer's circuit response; those remain
    // in src/data/circuits.ts until a reliable source is available.
    const slim = {
      circuitKey: data.circuitKey ?? circuitKey,
      circuitName: data.circuitName ?? "",
      year: data.year ?? year,
      rotation: data.rotation ?? 0,
      x: data.x ?? [],
      y: data.y ?? [],
      corners: (data.corners ?? []).map((c) => ({
        number: c.number,
        letter: c.letter ?? "",
        angle: c.angle ?? 0,
        length: c.length ?? 0,
        trackPosition: {
          x: c.trackPosition?.x ?? 0,
          y: c.trackPosition?.y ?? 0,
        },
      })),
      marshalSectors: (data.marshalSectors ?? []).map((m) => ({
        number: m.number,
        angle: m.angle ?? 0,
        length: m.length ?? 0,
        trackPosition: {
          x: m.trackPosition?.x ?? 0,
          y: m.trackPosition?.y ?? 0,
        },
      })),
      marshalLights: (data.marshalLights ?? []).map((m) => ({
        number: m.number,
        angle: m.angle ?? 0,
        length: m.length ?? 0,
        trackPosition: {
          x: m.trackPosition?.x ?? 0,
          y: m.trackPosition?.y ?? 0,
        },
      })),
      pitLoss: data.pitLoss
        ? {
            normal: data.pitLoss.normal,
            sc: data.pitLoss.sc,
            vsc: data.pitLoss.vsc,
          }
        : undefined,
    };

    const outPath = join(OUT_DIR, `${circuitKey}-${year}.json`);
    writeFileSync(outPath, JSON.stringify(slim, null, 2));
    console.log(
      `    → wrote ${outPath} (${slim.x.length} centerline pts, ${slim.corners.length} corners, ${slim.marshalSectors.length} sectors)`,
    );
    ok++;

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone: ${ok} written, ${skipped} skipped`);
  console.log("Commit the files in src/data/circuit-geometry/ to git.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
