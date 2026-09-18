import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Lap, Location } from "@/api/types";
import { lapsQueryKey } from "@/hooks/queryKeys";
import {
  MAX_GPS_OUTLINE_ATTEMPTS,
  pickOutlineLap,
  useTrackOutline,
} from "./useTrackMap";

const mockLaps = vi.fn();
const mockLocationForDriver = vi.fn();
const mockGetCircuitGeometry = vi.fn();

vi.mock("@/api/endpoints", () => ({
  api: {
    laps: (...args: unknown[]) => mockLaps(...args),
    locationForDriver: (...args: unknown[]) => mockLocationForDriver(...args),
  },
}));

vi.mock("@/data/circuitGeometry", () => ({
  getCircuitGeometry: (...args: unknown[]) => mockGetCircuitGeometry(...args),
}));

vi.mock("@/data/circuits", () => ({
  getCircuitLayout: () => null,
}));

function lap(driver: number, lapNumber: number, startIso: string): Lap {
  return {
    driver_number: driver,
    lap_number: lapNumber,
    date_start: startIso,
    lap_duration: 95,
  } as Lap;
}

function loc(driver: number, x: number, y: number): Location {
  return {
    driver_number: driver,
    date: "2026-09-13T13:05:00.000Z",
    x,
    y,
    z: 0,
  } as Location;
}

const SESSION_LAPS: Lap[] = [
  lap(1, 1, "2026-09-13T13:04:00.000Z"),
  lap(1, 2, "2026-09-13T13:05:40.000Z"),
  lap(3, 2, "2026-09-13T13:05:41.000Z"),
  lap(5, 3, "2026-09-13T13:07:20.000Z"),
  lap(10, 2, "2026-09-13T13:05:42.000Z"),
  lap(11, 2, "2026-09-13T13:05:43.000Z"),
];

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("pickOutlineLap", () => {
  it("prefers the requested lap, then lap 3, then the first valid lap", () => {
    expect(pickOutlineLap(SESSION_LAPS, 1, 2)?.lap_number).toBe(2);
    expect(pickOutlineLap(SESSION_LAPS, 5, 2)?.lap_number).toBe(3);
    expect(pickOutlineLap(SESSION_LAPS, 1, 7)?.lap_number).toBe(1);
    expect(pickOutlineLap(SESSION_LAPS, 99, 2)).toBeNull();
  });

  it("ignores laps without a start time or with an implausible duration", () => {
    const laps = [
      { ...lap(7, 2, ""), date_start: "" },
      { ...lap(7, 3, "2026-09-13T13:07:00.000Z"), lap_duration: 12 },
      { ...lap(7, 4, "2026-09-13T13:08:40.000Z"), lap_duration: null },
      lap(7, 5, "2026-09-13T13:10:20.000Z"),
    ] as Lap[];
    expect(pickOutlineLap(laps, 7, 2)?.lap_number).toBe(5);
  });
});

describe("useTrackOutline (GPS fallback)", () => {
  let client: QueryClient;

  beforeEach(() => {
    mockLaps.mockReset();
    mockLocationForDriver.mockReset();
    mockGetCircuitGeometry.mockReset();
    mockGetCircuitGeometry.mockReturnValue(null);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("stays pending without a driver list instead of reporting no data", () => {
    const { result } = renderHook(
      () => useTrackOutline(11369, [], 153, "Madring", 2, 2026),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(mockLaps).not.toHaveBeenCalled();
    expect(mockLocationForDriver).not.toHaveBeenCalled();
  });

  it("fetches the session laps once and stops at the first driver with location rows", async () => {
    mockLaps.mockResolvedValue(SESSION_LAPS);
    mockLocationForDriver.mockImplementation(
      async (_session: number, driver: number) =>
        driver === 1 ? [] : [loc(driver, 0, 0), loc(driver, 100, 50)],
    );

    const { result } = renderHook(
      () => useTrackOutline(11369, [1, 3, 5, 10, 11], 153, "Madring", 2, 2026),
      { wrapper: createWrapper(client) },
    );

    // While the fetch is in flight the hook must not resolve to `null`
    // (the caller renders "No location data" for that).
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.data).toMatchObject({ source: "gps" });
    expect(result.current.data?.points).toHaveLength(2);
    expect(mockLaps).toHaveBeenCalledTimes(1);
    expect(mockLaps).toHaveBeenCalledWith(11369);
    expect(mockLocationForDriver).toHaveBeenCalledTimes(2);
    expect(mockLocationForDriver.mock.calls.map((c) => c[1])).toEqual([1, 3]);
    // Lap 2 of driver 3 starts at 13:05:41 and lasts 95 s (+2 s pad).
    expect(mockLocationForDriver.mock.calls[1]).toEqual([
      11369,
      3,
      "2026-09-13T13:05:41.000Z",
      "2026-09-13T13:07:18.000Z",
    ]);
  });

  it("reuses laps already cached by useLaps() and never fires a laps request", async () => {
    client.setQueryData(lapsQueryKey(11369), SESSION_LAPS);
    mockLocationForDriver.mockResolvedValue([loc(1, 0, 0), loc(1, 10, 10)]);

    const { result } = renderHook(
      () => useTrackOutline(11369, [1, 3], 153, "Madring", 2, 2026),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(mockLaps).not.toHaveBeenCalled();
    expect(mockLocationForDriver).toHaveBeenCalledTimes(1);
    expect(result.current.data).toMatchObject({ source: "gps" });
  });

  it("gives up after a bounded number of drivers and resolves to null", async () => {
    mockLaps.mockResolvedValue(SESSION_LAPS);
    mockLocationForDriver.mockResolvedValue([]);

    const { result } = renderHook(
      () => useTrackOutline(11369, [1, 3, 5, 10, 11], 153, "Madring", 2, 2026),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toBeNull();
    expect(mockLaps).toHaveBeenCalledTimes(1);
    expect(mockLocationForDriver).toHaveBeenCalledTimes(
      MAX_GPS_OUTLINE_ATTEMPTS,
    );
  });

  it("skips candidate drivers without a usable lap without spending an attempt", async () => {
    mockLaps.mockResolvedValue(SESSION_LAPS);
    mockLocationForDriver.mockResolvedValue([]);

    const { result } = renderHook(
      () => useTrackOutline(11369, [98, 99, 1, 3, 5], 153, "Madring", 2, 2026),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(mockLocationForDriver.mock.calls.map((c) => c[1])).toEqual([
      1, 3, 5,
    ]);
  });

  it("returns baked geometry synchronously without touching the API", () => {
    mockGetCircuitGeometry.mockReturnValue({ x: [0, 10, 10], y: [0, 0, 5] });

    const { result } = renderHook(
      () => useTrackOutline(11361, [1, 3], 39, "Monza", 2, 2026),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toMatchObject({
      source: "baked",
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 5 },
    });
    expect(mockLaps).not.toHaveBeenCalled();
    expect(mockLocationForDriver).not.toHaveBeenCalled();
  });
});
