/**
 * Build-time bake script: pulls official circuit geometry from the MultiViewer
 * API and writes one JSON file per circuit key into src/data/circuit-geometry/.
 * Also fetches f1-circuits GeoJSON and bakes a Cartesian→WGS84 affine transform
 * so the satellite renderer can project car positions onto a map.
 *
 * Run once (or when a new season adds circuits):
 *   node scripts/fetch-circuits.mjs
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../src/data/circuit-geometry')
const OPENF1_BASE = 'https://api.openf1.org/v1'
const MV_BASE = 'https://api.multiviewer.app/api/v1'
const F1C_BASE = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master'

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'f1-replay-bake/1.0' } })
    if (res.status === 404) throw new Error(`HTTP 404 for ${url}`)
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

// ── Geo-affine algorithm ──────────────────────────────────────────────────────
// Maps F1 Cartesian (x, y) → WGS84 (lng, lat) via least-squares affine fit
// on resampled corresponding centerline point pairs.

/** Resample a closed polygon to N equally arc-length-spaced points. */
function resampleClosed(pts, N) {
  const n = pts.length
  if (n < 2) return []
  const arcs = [0]
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const dx = b.x - a.x, dy = b.y - a.y
    arcs.push(arcs[i] + Math.sqrt(dx * dx + dy * dy))
  }
  const total = arcs[n]
  const result = []
  let seg = 0
  for (let k = 0; k < N; k++) {
    const target = (k / N) * total
    while (seg < n - 1 && arcs[seg + 1] < target) seg++
    const segLen = arcs[seg + 1] - arcs[seg]
    const t = segLen > 1e-12 ? (target - arcs[seg]) / segLen : 0
    const a = pts[seg], b = pts[(seg + 1) % n]
    result.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
  }
  return result
}

/** Normalize a point list to [0,1]² for scale-independent comparison. */
function normalizePts(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const scale = Math.max(maxX - minX, maxY - minY) || 1
  return pts.map(p => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale }))
}

/**
 * Find the phase offset (and whether to reverse) that best aligns movPts to
 * refPts when both are normalized closed curves of length N.
 */
function findBestPhase(ref, mov) {
  const N = ref.length
  const refN = normalizePts(ref)
  const movN = normalizePts(mov)
  const movRevN = normalizePts([...mov].reverse())

  let bestK = 0, bestScore = Infinity, bestReversed = false
  for (const [curr, reversed] of [[movN, false], [movRevN, true]]) {
    for (let k = 0; k < N; k++) {
      let score = 0
      for (let i = 0; i < N; i++) {
        const r = refN[i], m = curr[(i + k) % N]
        const dx = r.x - m.x, dy = r.y - m.y
        score += dx * dx + dy * dy
        if (score >= bestScore) break // early exit
      }
      if (score < bestScore) { bestScore = score; bestK = k; bestReversed = reversed }
    }
  }
  return { offset: bestK, reversed: bestReversed }
}

/**
 * Solve a 3×3 linear system via Gaussian elimination with partial pivoting.
 * Input: flat 12-element array [a11..a33, b1..b3] (row-major augmented matrix).
 */
function solve3(flat) {
  const m = [
    [flat[0], flat[1], flat[2], flat[9]],
    [flat[3], flat[4], flat[5], flat[10]],
    [flat[6], flat[7], flat[8], flat[11]],
  ]
  for (let col = 0; col < 3; col++) {
    let maxRow = col
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[maxRow][col])) maxRow = row
    }
    ;[m[col], m[maxRow]] = [m[maxRow], m[col]]
    const pivot = m[col][col]
    if (Math.abs(pivot) < 1e-12) return null
    for (let row = col + 1; row < 3; row++) {
      const f = m[row][col] / pivot
      for (let k = col; k < 4; k++) m[row][k] -= f * m[col][k]
    }
  }
  const x = [0, 0, 0]
  for (let row = 2; row >= 0; row--) {
    let sum = m[row][3]
    for (let k = row + 1; k < 3; k++) sum -= m[row][k] * x[k]
    x[row] = sum / m[row][row]
  }
  return x
}

/**
 * Fit a 2-D affine (6-parameter) from srcPts (F1 Cartesian) to dstPts (lng/lat).
 * Returns { a,b,c, d,e,f } where lng = a*x+b*y+c, lat = d*x+e*y+f.
 */
function fitAffine2D(srcPts, dstPts) {
  const n = srcPts.length
  if (n < 3) return null
  let s11 = 0, s12 = 0, s13 = 0, s22 = 0, s23 = 0
  let lng1 = 0, lng2 = 0, lng3 = 0, lat1 = 0, lat2 = 0, lat3 = 0
  for (let i = 0; i < n; i++) {
    const { x, y } = srcPts[i]
    const { x: lng, y: lat } = dstPts[i]
    s11 += x * x; s12 += x * y; s13 += x
    s22 += y * y; s23 += y
    lng1 += x * lng; lng2 += y * lng; lng3 += lng
    lat1 += x * lat; lat2 += y * lat; lat3 += lat
  }
  const base = [s11, s12, s13, s12, s22, s23, s13, s23, n]
  const solLng = solve3([...base, lng1, lng2, lng3])
  const solLat = solve3([...base, lat1, lat2, lat3])
  if (!solLng || !solLat) return null
  return { a: solLng[0], b: solLng[1], c: solLng[2], d: solLat[0], e: solLat[1], f: solLat[2] }
}

/** RMS residual in degrees (validate fit quality). */
function affineRMSE(affine, srcPts, dstPts) {
  let sum = 0
  for (let i = 0; i < srcPts.length; i++) {
    const { x, y } = srcPts[i]
    const { x: lng, y: lat } = dstPts[i]
    const dl = affine.a * x + affine.b * y + affine.c - lng
    const da = affine.d * x + affine.e * y + affine.f - lat
    sum += dl * dl + da * da
  }
  return Math.sqrt(sum / srcPts.length)
}

/** Full pipeline: resample, align, fit, validate. */
function computeGeoAffine(mvX, mvY, geoCoords) {
  const N = 200
  if (!mvX.length || !geoCoords.length) return null

  const mvPts = mvX.map((x, i) => ({ x, y: mvY[i] }))
  // GeoJSON coords are [lng, lat]; drop duplicate closing point if present
  let geoPts = geoCoords.map(([lng, lat]) => ({ x: lng, y: lat }))
  const first = geoPts[0], last = geoPts[geoPts.length - 1]
  if (Math.abs(last.x - first.x) < 1e-8 && Math.abs(last.y - first.y) < 1e-8) {
    geoPts = geoPts.slice(0, -1)
  }

  const mvS = resampleClosed(mvPts, N)
  const geoS = resampleClosed(geoPts, N)

  const { offset, reversed } = findBestPhase(mvS, geoS)
  const base = reversed ? [...geoS].reverse() : geoS
  const aligned = Array.from({ length: N }, (_, i) => base[(i + offset) % N])

  const affine = fitAffine2D(mvS, aligned)
  if (!affine) return null

  const rmse = affineRMSE(affine, mvS, aligned)
  // ~0.001° ≈ 100 m; warn if worse but still keep the result
  if (rmse > 0.005) console.log(`    ⚠ geo affine RMSE ${rmse.toFixed(5)}° — check visually`)
  else console.log(`    ✓ geo affine RMSE ${rmse.toFixed(5)}°`)

  // Round to 10 significant figures to keep JSON compact
  const r = v => parseFloat(v.toPrecision(10))
  return { a: r(affine.a), b: r(affine.b), c: r(affine.c), d: r(affine.d), e: r(affine.e), f: r(affine.f) }
}

// ── f1-circuits name matching ─────────────────────────────────────────────────

function normName(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function loadF1CircuitsIndex() {
  console.log('Loading f1-circuits index…')
  try {
    const geojson = await fetchJSON(`${F1C_BASE}/f1-circuits.geojson`)
    const index = new Map()
    for (const feat of geojson.features ?? []) {
      const p = feat.properties ?? {}
      const id = p.id ?? p.Id
      const name = p.Name ?? p.name ?? ''
      if (id && name) index.set(normName(name), { id, name })
    }
    console.log(`  Loaded ${index.size} f1-circuits entries`)
    return index
  } catch (e) {
    console.warn(`  Could not load f1-circuits index: ${e.message}`)
    return new Map()
  }
}

function findF1CircuitsId(circuitName, index) {
  const key = normName(circuitName)
  if (index.has(key)) return index.get(key).id
  // Longest common prefix as a weak fallback
  let bestId = null, bestLen = 4 // require at least 5 chars overlap
  for (const [k, v] of index) {
    let i = 0
    while (i < key.length && i < k.length && key[i] === k[i]) i++
    if (i > bestLen) { bestLen = i; bestId = v.id }
  }
  return bestId
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // 1. Collect unique {circuit_key, year} pairs
  const years = [2023, 2024, 2025, 2026]
  const circuitYears = new Map()
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
    await new Promise(r => setTimeout(r, 400))
  }
  console.log(`Found ${circuitYears.size} unique circuit keys`)

  // 2. Load f1-circuits index once
  const f1cIndex = await loadF1CircuitsIndex()

  // 3. Fetch MultiViewer geometry + compute geo affine for each circuit
  let ok = 0, skipped = 0
  for (const [circuitKey, year] of circuitYears.entries()) {
    console.log(`  circuit_key=${circuitKey} year=${year}`)
    let data
    try {
      data = await fetchJSON(`${MV_BASE}/circuits/${circuitKey}/${year}`)
    } catch (e) {
      try {
        data = await fetchJSON(`${MV_BASE}/circuits/${circuitKey}/${year - 1}`)
        console.log(`    fell back to ${year - 1}`)
      } catch {
        console.warn(`    SKIP: ${e.message}`)
        skipped++
        continue
      }
    }

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

    // 4. Compute and bake geo affine
    if (slim.x.length && f1cIndex.size) {
      const f1cId = findF1CircuitsId(slim.circuitName, f1cIndex)
      if (f1cId) {
        console.log(`    geo: matched "${slim.circuitName}" → "${f1cId}"`)
        try {
          const geoJson = await fetchJSON(`${F1C_BASE}/circuits/${f1cId}.geojson`)
          const coords = geoJson.geometry?.coordinates ?? geoJson.features?.[0]?.geometry?.coordinates
          if (Array.isArray(coords) && coords.length > 10) {
            const affine = computeGeoAffine(slim.x, slim.y, coords)
            if (affine) slim.geoAffine = affine
          }
          await new Promise(r => setTimeout(r, 200))
        } catch (e) {
          console.warn(`    geo: could not fetch f1-circuits/${f1cId}: ${e.message}`)
        }
      } else {
        console.log(`    geo: no match for "${slim.circuitName}"`)
      }
    }

    const outPath = join(OUT_DIR, `${circuitKey}.json`)
    writeFileSync(outPath, JSON.stringify(slim, null, 2))
    console.log(`    → wrote ${outPath} (${slim.x.length} pts, ${slim.corners.length} corners${slim.geoAffine ? ', +geoAffine' : ''})`)
    ok++

    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone: ${ok} written, ${skipped} skipped`)
  console.log('Commit src/data/circuit-geometry/ to git.')
}

main().catch(e => { console.error(e); process.exit(1) })
