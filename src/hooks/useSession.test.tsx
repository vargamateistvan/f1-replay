import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/endpoints";
import { LIVE_POLL_SLOW_MS } from "@/utils/live";
import {
  useOvertakes, usePits, useSessionResult, useStartingGrid, useStints,
  useTeamRadio, useWeather,
} from "./useSession";

vi.mock("@/api/endpoints", () => ({
  api: {
    overtakes: vi.fn(), pits: vi.fn(), sessionResult: vi.fn(),
    startingGrid: vi.fn(), stints: vi.fn(), teamRadio: vi.fn(), weather: vi.fn(),
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
    for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(1);
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
});
