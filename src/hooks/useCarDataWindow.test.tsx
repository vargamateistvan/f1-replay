import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCarDataWindow } from "./useCarDataWindow";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

describe("useCarDataWindow", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
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
});
