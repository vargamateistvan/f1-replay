import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAllCarDataWindow } from "./useAllCarDataWindow";

const mockUseQuery = vi.fn();
const mockUseQueryClient = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useQueryClient: () => mockUseQueryClient(),
}));

describe("useAllCarDataWindow", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQueryClient.mockReset();
    mockUseQueryClient.mockReturnValue({
      getQueryCache: () => ({ findAll: () => [] }),
      removeQueries: vi.fn(),
    });
  });

  it("keeps merged data reference stable when source arrays do not change", () => {
    const previousData = [{ date: "2024-01-01T00:00:00Z", driver_number: 1 }];
    const currentData = [{ date: "2024-01-01T00:00:01Z", driver_number: 1 }];
    const nextData = [{ date: "2024-01-01T00:00:02Z", driver_number: 1 }];

    mockUseQuery.mockImplementation(
      (options: { queryKey: readonly unknown[] }) => {
        const idx = options.queryKey[2] as number;
        if (idx === 4) return { data: previousData, isPending: false };
        if (idx === 5) return { data: currentData, isPending: false };
        return { data: nextData, isPending: false };
      },
    );

    const { result, rerender } = renderHook(() =>
      useAllCarDataWindow(1, 1_000, 5, true),
    );

    const firstRef = result.current.data;
    rerender();

    expect(result.current.data).toBe(firstRef);
    expect(result.current.data).toHaveLength(3);
  });

  it("updates merged data reference when source arrays change", () => {
    let previousData: Array<{ date: string; driver_number: number }> = [
      { date: "2024-01-01T00:00:00Z", driver_number: 1 },
    ];
    let currentData: Array<{ date: string; driver_number: number }> = [
      { date: "2024-01-01T00:00:01Z", driver_number: 1 },
    ];
    let nextData: Array<{ date: string; driver_number: number }> = [
      { date: "2024-01-01T00:00:02Z", driver_number: 1 },
    ];

    mockUseQuery.mockImplementation(
      (options: { queryKey: readonly unknown[] }) => {
        const idx = options.queryKey[2] as number;
        if (idx === 4) return { data: previousData, isPending: false };
        if (idx === 5) return { data: currentData, isPending: false };
        return { data: nextData, isPending: false };
      },
    );

    const { result, rerender } = renderHook(() =>
      useAllCarDataWindow(1, 1_000, 5, true),
    );

    const firstRef = result.current.data;
    previousData = [
      ...previousData,
      { date: "2024-01-01T00:00:03Z", driver_number: 1 },
    ];
    rerender();

    expect(result.current.data).not.toBe(firstRef);
    expect(result.current.data).toHaveLength(4);
  });
});
