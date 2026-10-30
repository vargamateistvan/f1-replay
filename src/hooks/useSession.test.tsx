import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/endpoints";
import { OpenF1Error } from "@/api/client";
import type { Session } from "@/api/types";
import { LIVE_POLL_SLOW_MS } from "@/utils/live";
import {
  useOvertakes, usePits, useSessionResult, useStartingGrid, useStints,
  useTeamRadio, useWeather, useSessions, useCachedSimulationDrivers,
} from "./useSession";

vi.mock("@/api/endpoints", () => ({
  api: {
    overtakes: vi.fn(), pits: vi.fn(), sessionResult: vi.fn(),
    startingGrid: vi.fn(), stints: vi.fn(), teamRadio: vi.fn(), weather: vi.fn(),
    sessions: vi.fn(),
  },
}));

describe("staged session feeds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.overtakes).mockResolvedValue([]);
    vi.mocked(api.pits).mockResolvedValue([]);
    vi.mocked(api.sessionResult).mockResolvedValue([]);
    vi.mocked(api.startingGrid).mockResolvedValue([]);
    vi.mocked(api.stints).mockResolvedValue([]);
    vi.mocked(api.teamRadio).mockResolvedValue([]);
    vi.mocked(api.weather).mockResolvedValue([]);
    vi.mocked(api.sessions).mockResolvedValue([]);
  });

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return { client, wrapper };
  }

  it("does not enqueue deferred feeds until enabled, keeping their canonical keys", async () => {
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook(({ enabled }) => {
      const options = { enabled };
      return [
        useOvertakes(123, false, options), usePits(123, false, options),
        useSessionResult(123, options), useStartingGrid(123, null, options),
        useStints(123, false, options), useTeamRadio(123, false, options),
        useWeather(123, false, options),
      ];
    }, { initialProps: { enabled: false }, wrapper });
    for (const fetch of Object.values(api)) expect(fetch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true));
    for (const [name, fetch] of Object.entries(api)) {
      if (name !== "sessions") expect(fetch).toHaveBeenCalledTimes(1);
    }
    expect(client.getQueryData(["teamRadio", 123])).toEqual([]);
    expect(client.getQueryData(["startingGrid", 123, null])).toEqual([]);
    client.clear();
  });

  it("retains enabled-by-default behavior for other callers", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useTeamRadio(123), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.teamRadio).toHaveBeenCalledWith(123);
    client.clear();
  });

  it("opens a historical meeting from the cached season without another calendar request", async () => {
    const { client, wrapper } = setup();
    const historical = {
      meeting_key: 456, session_key: 123,
      date_end: "2024-01-01T14:00:00Z",
    } as Session;
    client.setQueryData(["sessions-year", 2024], [historical]);
    vi.mocked(api.sessions).mockRejectedValue(new OpenF1Error(401, "sessions"));
    const { result, unmount } = renderHook(() => useSessions(456), { wrapper });
    expect(result.current.data).toEqual([historical]);
    expect(result.current.isSuccess).toBe(true);
    expect(api.sessions).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });

  it("preserves live polling after deferred feeds are released", async () => {
    vi.useFakeTimers();
    const { client, wrapper } = setup();
    const { rerender, unmount } = renderHook(({ enabled }) =>
      useTeamRadio(123, true, { enabled }),
    { initialProps: { enabled: false }, wrapper });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_POLL_SLOW_MS); });
      expect(api.teamRadio).not.toHaveBeenCalled();
      rerender({ enabled: true });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(api.teamRadio).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_POLL_SLOW_MS); });
      expect(api.teamRadio).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      client.clear();
      vi.useRealTimers();
    }
  });

  it("reactively uses cached team data only from the selected year without fetching", () => {
    const { client, wrapper } = setup();
    const selected = {
      session_key: 123, year: 2024, date_start: "2024-06-01T12:00:00Z",
    };
    const sameYear = { ...selected, session_key: 124 };
    const otherYear = { ...selected, session_key: 125, year: 2026 };
    const historicalDrivers = [{ team_colour: "123456" }];
    const selectedDrivers = [{ team_colour: "ABCDEF" }];
    client.setQueryData(["sessions-year", 2026], [otherYear]);
    client.setQueryData(["drivers", 125], [{ team_colour: "FFFFFF" }]);
    const { result, rerender, unmount } = renderHook(
      ({ session }) => useCachedSimulationDrivers(session),
      { initialProps: { session: selected }, wrapper },
    );
    expect(result.current).toBeUndefined();
    act(() => {
      client.setQueryData(["sessions", 456], [sameYear]);
      client.setQueryData(["drivers", 124], historicalDrivers);
    });
    expect(result.current).toEqual(historicalDrivers);
    act(() => {
      client.setQueryData(["drivers", 123], selectedDrivers);
    });
    expect(result.current).toEqual(selectedDrivers);
    rerender({ session: { ...selected, year: 2025, session_key: 999 } });
    expect(result.current).toBeUndefined();
    for (const fetch of Object.values(api)) expect(fetch).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });

  it.each([401, 403])("stops live polling after access is denied (%s)", async (status) => {
    vi.useFakeTimers();
    const { client, wrapper } = setup();
    vi.mocked(api.teamRadio).mockRejectedValue(new OpenF1Error(status, "team_radio"));
    const { unmount } = renderHook(() => useTeamRadio(123, true), { wrapper });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(api.teamRadio).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(3 * LIVE_POLL_SLOW_MS); });
      expect(api.teamRadio).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      client.clear();
      vi.useRealTimers();
    }
  });
});
