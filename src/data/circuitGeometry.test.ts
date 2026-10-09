import { describe, expect, it } from "vitest";
import {
  getCircuitGeometry,
  hasCircuitGeometry,
  loadCircuitGeometry,
} from "./circuitGeometry";

// Uses the real baked files: circuit 7 has 2023–2026 layouts.
describe("circuitGeometry lazy loading", () => {
  it("knows which circuits have baked geometry without loading it", () => {
    expect(hasCircuitGeometry(7, 2024)).toBe(true);
    expect(hasCircuitGeometry(7)).toBe(true);
    expect(hasCircuitGeometry(-1, 2024)).toBe(false);
  });

  it("returns null synchronously until the geometry has been loaded", async () => {
    expect(getCircuitGeometry(7, 2024)).toBeNull();

    const geometry = await loadCircuitGeometry(7, 2024);
    expect(geometry?.x.length).toBeGreaterThan(0);
    expect(getCircuitGeometry(7, 2024)).toBe(geometry);
  });

  it("dedupes concurrent loads and caches the result", async () => {
    const [a, b] = await Promise.all([
      loadCircuitGeometry(7, 2025),
      loadCircuitGeometry(7, 2025),
    ]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(await loadCircuitGeometry(7, 2025)).toBe(a);
  });

  it("falls back to the most recent earlier layout, then the oldest", async () => {
    const exact2023 = await loadCircuitGeometry(7, 2023);
    expect(await loadCircuitGeometry(7, 2019)).toBe(exact2023);

    const exact2026 = await loadCircuitGeometry(7, 2026);
    expect(await loadCircuitGeometry(7, 2030)).toBe(exact2026);
    expect(await loadCircuitGeometry(7)).toBe(exact2026);
  });

  it("resolves null for circuits without baked geometry", async () => {
    expect(await loadCircuitGeometry(-1, 2024)).toBeNull();
    expect(getCircuitGeometry(-1, 2024)).toBeNull();
  });
});
