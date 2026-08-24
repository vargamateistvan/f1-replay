import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCarDataWindow } from "./useCarDataWindow";

const mockUseQuery = vi.fn();
const mockFindAll = vi.fn();
const mockRemoveQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useQueryClient: () => ({
    getQueryCache: () => ({ findAll: mockFindAll }),
    removeQueries: mockRemoveQueries,
  }),
}));

describe("useCarDataWindow", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockFindAll.mockReset();
    mockRemoveQueries.mockReset();
    mockFindAll.mockReturnValue([]);
  });

  it("keeps merged data reference stable when source arrays do not change", () => {
    const currentData = [{ date: "2024-01-01T00:00:00Z", driver_number: 1 }];
    const nextData = [{ date: "2024-01-01T00:00:01Z", driver_number: 1 }];

    mockUseQuery.mockImplementation(
      (options: { queryKey: readonly unknown[] }) => {
        const idx = options.queryKey[3];
        if (idx === 5) return { data: currentData, isPending: false };
        return { data: nextData, isPending: false };
      },
    );

    const { result, rerender } = renderHook(() =>
      useCarDataWindow(1, 1, 1_000, 5),
    );

    const firstRef = result.current.data;
    rerender();

    expect(result.current.data).toBe(firstRef);
    expect(result.current.data).toHaveLength(2);
  });

  it("updates merged data reference when source arrays change", () => {
    let currentData: Array<{ date: string; driver_number: number }> = [
      { date: "2024-01-01T00:00:00Z", driver_number: 1 },
    ];
    let nextData: Array<{ date: string; driver_number: number }> = [
      { date: "2024-01-01T00:00:01Z", driver_number: 1 },
    ];

    mockUseQuery.mockImplementation(
      (options: { queryKey: readonly unknown[] }) => {
        const idx = options.queryKey[3];
        if (idx === 5) return { data: currentData, isPending: false };
        return { data: nextData, isPending: false };
      },
    );

    const { result, rerender } = renderHook(() =>
      useCarDataWindow(1, 1, 1_000, 5),
    );

    const firstRef = result.current.data;
    nextData = [
      ...nextData,
      { date: "2024-01-01T00:00:02Z", driver_number: 1 },
    ];
    rerender();

    expect(result.current.data).not.toBe(firstRef);
    expect(result.current.data).toHaveLength(3);
  });

  it("evicts stale chunks and cross-session data", () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false });
    mockFindAll.mockReturnValue([
      { queryKey: ["carDataWindow", 1, 44, 4] },
      { queryKey: ["carDataWindow", 1, 44, 6] },
      { queryKey: ["carDataWindow", 1, 44, 3] },
      { queryKey: ["carDataWindow", 1, 44, 7] },
      { queryKey: ["carDataWindow", 2, 44, 5] },
      { queryKey: ["carDataWindow", 1, 55, 5] },
    ]);

    renderHook(() => useCarDataWindow(1, 44, 1_000, 5));

    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["carDataWindow", 1, 44, 3],
      exact: true,
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["carDataWindow", 1, 44, 7],
      exact: true,
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["carDataWindow", 2, 44, 5],
      exact: true,
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["carDataWindow", 1, 55, 5],
      exact: true,
    });
    expect(mockRemoveQueries).toHaveBeenCalledTimes(4);
  });

  it("shared mode reads the all-driver window and filters by driver", () => {
    mockUseQuery.mockImplementation(
      (options: {
        queryKey: readonly unknown[];
        enabled?: boolean;
      }) => {
        if (options.queryKey[0] === "allCarDataWindow") {
          return {
            data: [
              { date: "2024-01-01T00:00:00Z", driver_number: 44 },
              { date: "2024-01-01T00:00:00Z", driver_number: 1 },
            ],
            isPending: false,
          };
        }
        return { data: [], isPending: true };
      },
    );

    const { result } = renderHook(() =>
      useCarDataWindow(1, 44, 1_000, 5, { sharedAllDriverWindow: true }),
    );

    // current + next shared chunks, only driver 44's rows
    expect(result.current.data).toHaveLength(2);
    expect(
      result.current.data.every((d) => d.driver_number === 44),
    ).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it("shared mode disables per-driver queries and enables shared ones", () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false });

    renderHook(() =>
      useCarDataWindow(1, 44, 1_000, 5, { sharedAllDriverWindow: true }),
    );

    const calls = mockUseQuery.mock.calls.map(
      (call) =>
        call[0] as { queryKey: readonly unknown[]; enabled?: boolean },
    );
    const perDriver = calls.filter((o) => o.queryKey[0] === "carDataWindow");
    const shared = calls.filter((o) => o.queryKey[0] === "allCarDataWindow");

    expect(perDriver).toHaveLength(2);
    expect(perDriver.every((o) => o.enabled === false)).toBe(true);
    expect(shared).toHaveLength(2);
    expect(shared.every((o) => o.enabled === true)).toBe(true);
    expect(shared.map((o) => o.queryKey)).toEqual([
      ["allCarDataWindow", 1, 5],
      ["allCarDataWindow", 1, 6],
    ]);
  });

  it("shared mode evicts leftover per-driver chunks", () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false });
    mockFindAll.mockReturnValue([
      { queryKey: ["carDataWindow", 1, 44, 5] },
      { queryKey: ["carDataWindow", 1, 44, 6] },
    ]);

    renderHook(() =>
      useCarDataWindow(1, 44, 1_000, 5, { sharedAllDriverWindow: true }),
    );

    expect(mockRemoveQueries).toHaveBeenCalledTimes(2);
  });
});
