import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { CircuitGeometry } from "@/data/circuitGeometry";
import { useCircuitGeometry } from "./useCircuitGeometry";

const cache = new Map<string, CircuitGeometry>();
const mockLoad = vi.fn();

vi.mock("@/data/circuitGeometry", () => ({
  hasCircuitGeometry: (key: number) => key === 7,
  getCircuitGeometry: (key: number, year: number | null) =>
    cache.get(`${key}-${year}`) ?? null,
  loadCircuitGeometry: (...args: unknown[]) => mockLoad(...args),
}));

const GEOMETRY = { x: [0, 1], y: [0, 1] } as CircuitGeometry;

describe("useCircuitGeometry", () => {
  beforeEach(() => {
    cache.clear();
    mockLoad.mockReset();
  });

  it("is not pending and returns null when no baked geometry exists", () => {
    const { result } = renderHook(() => useCircuitGeometry(99, 2024));
    expect(result.current).toEqual({ data: null, isPending: false });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("is not pending for a missing circuit key", () => {
    const { result } = renderHook(() => useCircuitGeometry(null, 2024));
    expect(result.current).toEqual({ data: null, isPending: false });
  });

  it("loads geometry on demand and re-renders with it", async () => {
    mockLoad.mockImplementation(async (key: number, year: number) => {
      cache.set(`${key}-${year}`, GEOMETRY);
      return GEOMETRY;
    });

    const { result } = renderHook(() => useCircuitGeometry(7, 2024));
    expect(result.current).toEqual({ data: null, isPending: true });

    await waitFor(() => expect(result.current.data).toBe(GEOMETRY));
    expect(result.current.isPending).toBe(false);
    expect(mockLoad).toHaveBeenCalledWith(7, 2024);
  });

  it("returns already-loaded geometry synchronously", () => {
    cache.set("7-2024", GEOMETRY);
    const { result } = renderHook(() => useCircuitGeometry(7, 2024));
    expect(result.current).toEqual({ data: GEOMETRY, isPending: false });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("stops pending when loading fails", async () => {
    mockLoad.mockRejectedValue(new Error("chunk load failed"));
    const { result } = renderHook(() => useCircuitGeometry(7, 2024));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toBeNull();
  });
});
