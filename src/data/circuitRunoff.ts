/**
 * Baked run-off look per circuit (src/data/circuit-runoff.json), keyed by
 * circuit_key: gravel, sand or tarmac (optionally with painted bands), or
 * "street" for walled street circuits with no run-off. Hand-picked entries
 * are "curated"; new venues are classified from OpenStreetMap by
 * `node scripts/fetch-runoff.mjs` (the update-circuits workflow) and marked
 * "osm" ("default" = provisional gravel, retried). Unlisted circuits get gravel.
 *
 * Import only from the lazily-loaded 3D map chunk.
 */
import type { RunoffSurface } from "@/constants";
import baked from "./circuit-runoff.json";

export interface RunoffStyle {
  surface: RunoffSurface | "street";
  /** Painted on tarmac parallel to the track, outward from the verge in order. */
  bands?: readonly { color: string; widthM: number }[];
}

export interface RunoffEntry extends RunoffStyle {
  name: string;
  /** Hand-picked, classified from OSM, or provisional gravel while OSM was unreachable. */
  source: "curated" | "osm" | "default";
  /** OSM classification metrics: share of the lap on public roads / near gravel. */
  streetShare?: number;
  gravelShare?: number;
}

export const RUNOFF_ENTRIES = (baked as { circuits: Record<string, RunoffEntry> }).circuits;

const GRAVEL: RunoffStyle = { surface: "gravel" };

export function getRunoffStyle(circuitKey: number | null | undefined): RunoffStyle {
  if (circuitKey == null) return GRAVEL;
  return RUNOFF_ENTRIES[String(circuitKey)] ?? GRAVEL;
}

export const isStreetCircuit = (circuitKey: number | null | undefined) =>
  getRunoffStyle(circuitKey).surface === "street";
