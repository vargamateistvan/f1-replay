import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { resetReleaseDateCache, useReleaseDate } from "@/hooks/useReleaseDate";

describe("useReleaseDate", () => {
  afterEach(() => {
    resetReleaseDateCache();
    vi.unstubAllGlobals();
  });

  it("returns the published date and shares one request across consumers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ published_at: "2026-09-20T10:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = renderHook(() => useReleaseDate());
    const second = renderHook(() => useReleaseDate());

    await waitFor(() =>
      expect(first.result.current).toBe("2026-09-20T10:00:00Z"),
    );
    await waitFor(() =>
      expect(second.result.current).toBe("2026-09-20T10:00:00Z"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the request fails and retries on the next mount", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created_at: "2026-09-01T00:00:00Z" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const failed = renderHook(() => useReleaseDate());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Let the rejected promise settle so the cache is cleared.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed.result.current).toBeNull();

    const retried = renderHook(() => useReleaseDate());
    await waitFor(() =>
      expect(retried.result.current).toBe("2026-09-01T00:00:00Z"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
