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

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../src/data/circuit-geometry')
const OPENF1_BASE = 'https://api.openf1.org/v1'
const MV_BASE = 'https://api.multiviewer.app/api/v1'

/** Fetch with basic retry on 429 / 5xx */
async function fetchJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'f1-replay-bake/1.0' } })
    if (res.status === 429 || res.status >= 500) {
      const delay = (attempt + 1) * 2000
      console.warn(`  ${res.status} on ${url} — retrying in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res.json()
  }
  throw new Error(`Giving up on ${url} after retries`)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // 1. Collect all unique {circuit_key, year} pairs across 2023–present
  const years = [2023, 2024, 2025, 2026]
  const circuitYears = new Map() // circuit_key → newest year seen

  for (const year of years) {
    console.log(`Fetching sessions for ${year}…`)
    let sessions
    try {
      sessions = await fetchJSON(`${OPENF1_BASE}/sessions?year=${year}`)
    } catch (e) {
      console.warn(`  Skipping ${year}: ${e.message}`)
      continue
    }
    for (const s of sessions) {
      if (!s.circuit_key) continue
      const cur = circuitYears.get(s.circuit_key)
      if (!cur || s.year > cur) circuitYears.set(s.circuit_key, s.year)
    }
    await new Promise(r => setTimeout(r, 400)) // be gentle on the rate limit
  }

  console.log(`Found ${circuitYears.size} unique circuit keys`)

  // 2. Fetch MultiViewer geometry for each circuit key
  let ok = 0, skipped = 0
  for (const [circuitKey, year] of circuitYears.entries()) {
    console.log(`  circuit_key=${circuitKey} year=${year}`)
    let data
    try {
      data = await fetchJSON(`${MV_BASE}/circuits/${circuitKey}/${year}`)
    } catch (e) {
      // Try the previous year as fallback
      try {
        data = await fetchJSON(`${MV_BASE}/circuits/${circuitKey}/${year - 1}`)
        console.log(`    fell back to ${year - 1}`)
      } catch {
        console.warn(`    SKIP: ${e.message}`)
        skipped++
        continue
      }
    }

    // Keep only the fields we use; drop any proprietary/undocumented keys
    const slim = {
      circuitKey: data.circuitKey ?? circuitKey,
      circuitName: data.circuitName ?? '',
      year: data.year ?? year,
      rotation: data.rotation ?? 0,
      x: data.x ?? [],
      y: data.y ?? [],
      ...(Array.isArray(data.z) && data.z.length ? { z: data.z } : {}),
      corners: (data.corners ?? []).map(c => ({
        number: c.number,
        letter: c.letter ?? '',
        angle: c.angle ?? 0,
        length: c.length ?? 0,
        trackPosition: { x: c.trackPosition?.x ?? 0, y: c.trackPosition?.y ?? 0 },
      })),
      marshalSectors: (data.marshalSectors ?? []).map(m => ({
        number: m.number,
        trackPosition: { x: m.trackPosition?.x ?? 0, y: m.trackPosition?.y ?? 0 },
      })),
      marshalLights: (data.marshalLights ?? []).map(m => ({
        number: m.number,
        trackPosition: { x: m.trackPosition?.x ?? 0, y: m.trackPosition?.y ?? 0 },
      })),
    }

    const outPath = join(OUT_DIR, `${circuitKey}.json`)
    writeFileSync(outPath, JSON.stringify(slim, null, 2))
    console.log(`    → wrote ${outPath} (${slim.x.length} centerline pts, ${slim.corners.length} corners, ${slim.marshalSectors.length} sectors)`)
    ok++

    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone: ${ok} written, ${skipped} skipped`)
  console.log('Commit the files in src/data/circuit-geometry/ to git.')
}

main().catch(e => { console.error(e); process.exit(1) })
