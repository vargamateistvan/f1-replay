import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applicationServerKey, ensurePushCredential, loadPushConfig, pushRequest,
  pushSupport, readPushCredential, removePushCredential,
} from "./webPush";
import { PUSH_CREDENTIAL_STORAGE_KEY } from "@/constants";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem(PUSH_CREDENTIAL_STORAGE_KEY);
});

describe("Web Push browser integration", () => {
  it("uses a stable device credential outside exported settings", () => {
    const credential = ensurePushCredential();
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ensurePushCredential()).toBe(credential);
    expect(readPushCredential()).toBe(credential);
    removePushCredential();
    expect(readPushCredential()).toBeNull();
  });

  it("identifies Home Screen installation requirements on iOS and iPadOS", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    expect(pushSupport()).toBe("install-required");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Macintosh");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 5 });
    expect(pushSupport()).toBe("install-required");
    Reflect.deleteProperty(navigator, "maxTouchPoints");
  });

  it("does not claim support without Push APIs", () => {
    expect(pushSupport()).toBe("unsupported");
  });

  it("surfaces API errors without leaking device credentials into URLs", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Wait a minute." }), { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(pushRequest("test", "POST", "device-secret")).rejects.toThrow("Wait a minute.");
    expect(fetch.mock.calls[0][0]).toMatch(/\/notifications\/test$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: "omit", cache: "no-store", headers: { Authorization: "Bearer device-secret" },
    });
  });

  it("accepts disabled configuration but rejects malformed enabled configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false }))));
    expect(await loadPushConfig()).toEqual({ enabled: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: true }))));
    await expect(loadPushConfig()).rejects.toThrow("Invalid notification server configuration.");
    expect(() => applicationServerKey("invalid")).toThrow();
  });
});
