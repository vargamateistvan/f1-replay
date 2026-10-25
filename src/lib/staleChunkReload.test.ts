import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CHUNK_RELOAD_COOLDOWN_MS } from "@/constants";
import {
  handleStaleChunkError,
  installStaleChunkReload,
  isReloadingForStaleChunk,
  isStaleChunkError,
  reloadForStaleChunk,
  resetStaleChunkReload,
} from "./staleChunkReload";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

afterEach(() => {
  resetStaleChunkReload();
  sessionStorage.clear();
});

describe("isStaleChunkError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://f1replay.app/assets/Schedule-DoO3Ueew.js",
    "error loading dynamically imported module: https://f1replay.app/assets/x.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/index-abc.css",
    "'text/html' is not a valid JavaScript MIME type.",
  ])("matches %s", (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
    expect(isStaleChunkError(message)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleChunkError(new Error("Telemetry failed"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe("reloadForStaleChunk", () => {
  it("reloads once and records the time", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadForStaleChunk({ storage, reload, now: 1_000_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(isReloadingForStaleChunk()).toBe(true);

    // Repeated failures on the same page don't trigger more reloads.
    expect(reloadForStaleChunk({ storage, reload, now: 1_000_001 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("refuses to reload again within the cooldown", () => {
    const now = 5_000_000;
    const storage = memoryStorage({
      __stale_chunk_reload_at: String(now - STALE_CHUNK_RELOAD_COOLDOWN_MS + 1),
    });
    const reload = vi.fn();
    expect(reloadForStaleChunk({ storage, reload, now })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again once the cooldown has passed", () => {
    const now = 5_000_000;
    const storage = memoryStorage({
      __stale_chunk_reload_at: String(now - STALE_CHUNK_RELOAD_COOLDOWN_MS),
    });
    const reload = vi.fn();
    expect(reloadForStaleChunk({ storage, reload, now })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload without storage to guard against loops", () => {
    const reload = vi.fn();
    expect(reloadForStaleChunk({ storage: null, reload, now: 1 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when storage throws", () => {
    const reload = vi.fn();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(reloadForStaleChunk({ storage, reload, now: 1 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("handleStaleChunkError", () => {
  it("only reloads for chunk errors", () => {
    const reload = vi.fn();
    const env = { storage: memoryStorage(), reload, now: 1_000_000 };
    expect(handleStaleChunkError(new Error("boom"), env)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(
      handleStaleChunkError(
        new TypeError("Failed to fetch dynamically imported module: /a.js"),
        env,
      ),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("installStaleChunkReload", () => {
  it("reloads on vite:preloadError without swallowing the error", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...globalThis.location, reload });
    const target = new EventTarget() as Window;
    installStaleChunkReload(target);

    const event = new Event("vite:preloadError", { cancelable: true });
    (event as Event & { payload?: unknown }).payload = new TypeError(
      "Failed to fetch dynamically imported module: /assets/Schedule.js",
    );
    target.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    vi.unstubAllGlobals();
  });
});
