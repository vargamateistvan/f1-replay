import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/endpoints";
import type { Location } from "@/api/types";
import { LOCATION_CHUNK_MS } from "@/constants";
import { useLocationChunks } from "./useLocationChunks";

vi.mock("@/api/endpoints", () => ({ api: { locationWindow: vi.fn() } }));

describe("location startup request order", () => {
  beforeEach(() => vi.clearAllMocks());

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return { client, wrapper };
  }

  it("requests only the destination chunk first on a paused deep-link seek", async () => {
    let resolve!: (rows: Location[]) => void;
    vi.mocked(api.locationWindow)
      .mockImplementationOnce(() => new Promise<Location[]>((done) => { resolve = done; }))
      .mockResolvedValue([]);
    const { client, wrapper } = setup();
    const start = Date.parse("2026-01-01T00:00:00Z");
    const { result, unmount } = renderHook(() =>
      useLocationChunks(123, start, 4, 4 * LOCATION_CHUNK_MS, {
        playbackSpeed: 16, prefetchChunks: true,
      }), { wrapper });
    expect(api.locationWindow).toHaveBeenCalledTimes(1);
    expect(api.locationWindow).toHaveBeenNthCalledWith(
      1, 123, new Date(start + 4 * LOCATION_CHUNK_MS).toISOString(),
      new Date(start + 5 * LOCATION_CHUNK_MS).toISOString(),
    );
    expect(result.current.isPending).toBe(true);
    await act(async () => resolve([]));
    await waitFor(() => expect(api.locationWindow).toHaveBeenCalledTimes(4));
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual([]);
    unmount();
    client.clear();
  });

  it("surfaces current-chunk failures instead of treating them as loading forever", async () => {
    const error = new Error("GPS unavailable");
    vi.mocked(api.locationWindow).mockRejectedValue(error);
    const { client, wrapper } = setup();
    const { result, unmount } = renderHook(() =>
      useLocationChunks(123, 1000, 0, 0, {
        includeNextChunk: false, prefetchChunks: false,
      }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.isPending).toBe(false);
    vi.mocked(api.locationWindow).mockResolvedValue([]);
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();
    client.clear();
  });
});
