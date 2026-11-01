/**
 * Circuit positions (WGS84) for the schedule world map, taken from the baked
 * georeference origins (`circuit-georef.json`) — a point on the circuit,
 * plenty precise at world scale.
 *
 * Import only from lazily-loaded chunks: the JSON is not needed at startup.
 */
import type { LngLat } from "@/utils/worldMap";
import baked from "./circuit-georef.json";

const LOCATIONS = new Map<number, LngLat>();
for (const [key, georef] of Object.entries(
  baked.circuits as Record<string, { originLng: number; originLat: number }>,
)) {
  // Keys are `${circuitKey}-${year}`; a venue's origin barely moves between
  // years, so any entry will do.
  const circuitKey = Number(key.split("-")[0]);
  if (!LOCATIONS.has(circuitKey)) {
    LOCATIONS.set(circuitKey, { lng: georef.originLng, lat: georef.originLat });
  }
}

export function getCircuitLocation(circuitKey: number | null | undefined): LngLat | null {
  if (circuitKey == null) return null;
  return LOCATIONS.get(circuitKey) ?? null;
}
