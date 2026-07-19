/**
 * Rate-limiter and deduplication tests for api/client.ts.
 *
 * Strategy: vi.resetModules() gives each test a fresh module with zeroed
 * sliding-window state, so tests do not bleed into each other.
 * Tests that need fake timers scope them locally inside the test body.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

async function importFreshClient() {
  vi.resetModules();
  return import("./client");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// isAuthError

describe("isAuthError", () => {
  it("returns true for 401", async () => {
    const { isAuthError, OpenF1Error } = await importFreshClient();
    expect(isAuthError(new OpenF1Error(401, "drivers"))).toBe(true);
  });

  it("returns true for 403", async () => {
    const { isAuthError, OpenF1Error } = await importFreshClient();
    expect(isAuthError(new OpenF1Error(403, "drivers"))).toBe(true);
  });

  it("returns false for 500", async () => {
    const { isAuthError, OpenF1Error } = await importFreshClient();
    expect(isAuthError(new OpenF1Error(500, "drivers"))).toBe(false);
  });

  it("returns false for non-OpenF1Error values", async () => {
    const { isAuthError } = await importFreshClient();
    expect(isAuthError(new Error("boom"))).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});

// In-flight deduplication

describe("fetchEndpoint - in-flight deduplication", () => {
  it("uses the configured base url when present", async () => {
    vi.stubEnv("VITE_OPENF1_API_BASE", "/openf1/v1");
    const { fetchEndpoint } = await importFreshClient();

    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown) => {
        capturedUrl = String(input);
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    await fetchEndpoint("meetings", { year: 2026 });

    expect(capturedUrl).toBe("/openf1/v1/meetings?year=2026");
  });

  it("deduplicates concurrent requests to the same URL", async () => {
    const { fetchEndpoint } = await importFreshClient();

    let resolveFirst!: (v: unknown) => void;
    const firstFetch = new Promise((res) => {
      resolveFirst = res;
    });

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        return firstFetch.then(() => ({ ok: true, json: async () => [] }));
      }),
    );

    const p1 = fetchEndpoint("sessions", { meeting_key: 1 });
    const p2 = fetchEndpoint("sessions", { meeting_key: 1 });

    resolveFirst(undefined);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(callCount).toBe(1);
    expect(r1).toBe(r2);
  });

  it("removes the dedup entry after success, allowing a fresh fetch", async () => {
    const { fetchEndpoint } = await importFreshClient();

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    await fetchEndpoint("sessions", { meeting_key: 1 });
    await fetchEndpoint("sessions", { meeting_key: 1 });

    expect(callCount).toBe(2);
  });

  it("removes the dedup entry after rejection, allowing retry", async () => {
    const { fetchEndpoint, OpenF1Error } = await importFreshClient();

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: { get: () => null },
            clone: () => ({ json: async () => ({}) }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    await expect(
      fetchEndpoint("drivers", { session_key: 999 }),
    ).rejects.toBeInstanceOf(OpenF1Error);

    const result = await fetchEndpoint("drivers", { session_key: 999 });
    expect(result).toEqual([]);
    expect(callCount).toBe(2);
  });
});

// Rate limiter

describe("fetchEndpoint - rate limiter", () => {
  it("allows up to 3 requests to start within the same second", async () => {
    const { fetchEndpoint } = await importFreshClient();

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    await Promise.all([
      fetchEndpoint("sessions", { meeting_key: 1 }),
      fetchEndpoint("sessions", { meeting_key: 2 }),
      fetchEndpoint("sessions", { meeting_key: 3 }),
    ]);

    expect(callCount).toBe(3);
  });

  it("queues the 4th request when 3 were made in < 1 second", async () => {
    vi.useFakeTimers();
    try {
      const { fetchEndpoint } = await importFreshClient();

      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          callCount++;
          return Promise.resolve({ ok: true, json: async () => [] });
        }),
      );

      const promises = [
        fetchEndpoint("sessions", { meeting_key: 1 }),
        fetchEndpoint("sessions", { meeting_key: 2 }),
        fetchEndpoint("sessions", { meeting_key: 3 }),
        fetchEndpoint("sessions", { meeting_key: 4 }),
      ];

      // Shortly after enqueue, the 4th request must still be blocked by the 1s budget.
      await vi.advanceTimersByTimeAsync(50);
      expect(callCount).toBeLessThan(4);

      // Advance past the 1-second window so the 4th slot opens
      await vi.advanceTimersByTimeAsync(1_100);
      await Promise.all(promises);
      expect(callCount).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a location 404 as an empty array", async () => {
    const { fetchEndpoint } = await importFreshClient();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          clone: () => ({
            json: async () => ({ detail: "No results found." }),
          }),
        }),
      ),
    );

    const result = await fetchEndpoint("location", {
      session_key: 1,
      "date>": "2024-01-01T00:00:00Z",
      "date<": "2024-01-01T00:05:00Z",
    });
    expect(result).toEqual([]);
  });

  it("throws OpenF1Error on non-retryable 4xx", async () => {
    const { fetchEndpoint, OpenF1Error } = await importFreshClient();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          headers: { get: () => null },
          clone: () => ({ json: async () => ({}) }),
        }),
      ),
    );

    await expect(
      fetchEndpoint("drivers", { session_key: 1 }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof OpenF1Error && (e as { status: number }).status === 401,
    );
  });

  it("returns parsed JSON array on success", async () => {
    const { fetchEndpoint } = await importFreshClient();

    const payload = [{ session_key: 42, session_name: "Race" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => payload })),
    );

    const result = await fetchEndpoint("sessions", { meeting_key: 100 });
    expect(result).toEqual(payload);
  });
});
