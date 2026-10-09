import { useEffect, useState } from "react";
import {
  getCircuitGeometry,
  hasCircuitGeometry,
  loadCircuitGeometry,
  type CircuitGeometry,
} from "@/data/circuitGeometry";

/**
 * Baked official circuit geometry for a circuit, loaded on demand (it's a
 * bundled static asset, so it bypasses the API/query cache layer).
 *
 * `isPending` is true only while geometry that exists for the circuit is still
 * being fetched, so callers can hold off on GPS-derived fallbacks until it's
 * known whether baked data will arrive.
 */
export function useCircuitGeometry(
  circuitKey: number | null | undefined,
  year: number | null | undefined,
): { data: CircuitGeometry | null; isPending: boolean } {
  const key = circuitKey ?? null;
  const normalizedYear = year ?? null;
  const requestId = `${key}-${normalizedYear}`;
  const available = key !== null && hasCircuitGeometry(key, normalizedYear);
  const data = key !== null ? getCircuitGeometry(key, normalizedYear) : null;
  const isLoaded = data !== null;

  const [, setLoadedId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    if (!available || isLoaded || key === null) return;
    let cancelled = false;
    loadCircuitGeometry(key, normalizedYear)
      .then(() => {
        if (!cancelled) setLoadedId(requestId);
      })
      .catch(() => {
        if (!cancelled) setFailedId(requestId);
      });
    return () => {
      cancelled = true;
    };
  }, [available, isLoaded, key, normalizedYear, requestId]);

  return {
    data,
    isPending: available && !isLoaded && failedId !== requestId,
  };
}
