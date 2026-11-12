import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushNotifications } from "./usePushNotifications";
import { PUSH_CREDENTIAL_STORAGE_KEY } from "@/constants";
import { DEFAULT_PUSH_PREFERENCES } from "@/utils/pushPreferences";

const publicKey = btoa(String.fromCharCode(4, ...Array<number>(64).fill(1)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const endpoint = "https://web.push.apple.com/test";
const unsubscribe = vi.fn();
const subscription = { endpoint, unsubscribe, toJSON: () => ({ endpoint, keys: { p256dh: publicKey, auth: "auth" } }) };
const getSubscription = vi.fn();
const subscribe = vi.fn();
const requestPermission = vi.fn();
const register = vi.fn();
const fetchMock = vi.fn();
let registered = false;

beforeEach(() => {
  registered = false;
  localStorage.removeItem(PUSH_CREDENTIAL_STORAGE_KEY);
  getSubscription.mockReset().mockResolvedValue(null);
  subscribe.mockReset().mockResolvedValue(subscription);
  unsubscribe.mockReset().mockResolvedValue(true);
  requestPermission.mockReset().mockResolvedValue("granted");
  register.mockReset().mockResolvedValue(undefined);
  const worker = { pushManager: { getSubscription, subscribe } };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, ready: Promise.resolve(worker), getRegistration: vi.fn().mockResolvedValue(worker) },
  });
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  fetchMock.mockReset().mockImplementation(async (url: string, options: { method?: string }) => {
    if (url.endsWith("/config")) return Response.json({ enabled: true, publicKey });
    if (url.endsWith("/subscriptions")) {
      registered = true;
      return Response.json({ enabled: true });
    }
    if (url.endsWith("/subscription") && options.method === "DELETE") {
      registered = false;
      return Response.json({ enabled: false });
    }
    if (url.endsWith("/subscription")) return Response.json({ enabled: registered, endpoint });
    if (url.endsWith("/test")) return Response.json({ sent: true });
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
  localStorage.removeItem(PUSH_CREDENTIAL_STORAGE_KEY);
});

describe("device notification lifecycle", () => {
  it("loads and saves server-confirmed alert preferences only when available", async () => {
    const defaultFetch = fetchMock.getMockImplementation()!;
    let preferences = structuredClone(DEFAULT_PUSH_PREFERENCES);
    fetchMock.mockImplementation(async (url: string, options: { method?: string; body?: string }) => {
      if (url.endsWith("/config")) return Response.json({ enabled: true, publicKey, automaticAlerts: true });
      if (url.endsWith("/preferences")) {
        if (options.method === "PATCH") preferences = JSON.parse(options.body!);
        return Response.json({ preferences });
      }
      return defaultFetch(url, options);
    });
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.preferences).toEqual(DEFAULT_PUSH_PREFERENCES));
    act(() => result.current.updatePreferences({
      ...preferences, alerts: { ...preferences.alerts, started: true },
    }));
    await waitFor(() => expect(result.current.preferences?.alerts.started).toBe(true));
    expect(preferences.alerts.started).toBe(true);
  });

  it("keeps the previous preferences and reports a failed update", async () => {
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, options: { method?: string }) => {
      if (url.endsWith("/config")) return Response.json({ enabled: true, publicKey, automaticAlerts: true });
      if (url.endsWith("/preferences")) {
        return options.method === "PATCH"
          ? Response.json({ error: "Preferences could not be saved." }, { status: 503 })
          : Response.json({ preferences: DEFAULT_PUSH_PREFERENCES });
      }
      return defaultFetch(url, options);
    });
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.preferences).toEqual(DEFAULT_PUSH_PREFERENCES));
    act(() => result.current.updatePreferences({
      ...DEFAULT_PUSH_PREFERENCES, alerts: { ...DEFAULT_PUSH_PREFERENCES.alerts, started: true },
    }));
    await waitFor(() => expect(result.current.error).toBe("Preferences could not be saved."));
    expect(result.current.preferences).toEqual(DEFAULT_PUSH_PREFERENCES);
  });

  it("never requests permission on mount and requests it directly from enable", async () => {
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.config?.enabled).toBe(true));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(requestPermission).not.toHaveBeenCalled();
    act(() => {
      result.current.enable();
      expect(requestPermission).toHaveBeenCalledOnce();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    act(() => result.current.sendTest());
    await waitFor(() => expect(result.current.notice).toMatch(/accepted by the push service/));
    act(() => result.current.disable());
    await waitFor(() => expect(result.current.hasSubscription).toBe(false));
    expect(registered).toBe(false);
    expect(localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY)).toBeNull();
  });

  it("does not claim enabled after a server registration failure and can retry the same credential", async () => {
    const defaultFetch = fetchMock.getMockImplementation()!;
    let fail = true;
    fetchMock.mockImplementation(async (url: string, options: { method?: string }) => {
      if (fail && url.endsWith("/subscriptions")) {
        return Response.json({ error: "Service unavailable." }, { status: 503 });
      }
      return defaultFetch(url, options);
    });
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.error).toBe("Service unavailable."));
    expect(result.current.enabled).toBe(false);
    expect(result.current.hasSubscription).toBe(true);
    const credential = localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY);
    getSubscription.mockResolvedValue(subscription);
    fail = false;
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY)).toBe(credential);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("reports denial without subscribing", async () => {
    requestPermission.mockResolvedValue("denied");
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.permission).toBe("denied"));
    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/permission was not granted/);
  });

  it("keeps local cleanup retryable after unsubscribe fails", async () => {
    getSubscription.mockResolvedValue(subscription);
    unsubscribe.mockResolvedValue(false);
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.enabled).toBe(true));
    act(() => result.current.disable());
    await waitFor(() => expect(result.current.error).toMatch(/browser unsubscribe failed/));
    expect(result.current.enabled).toBe(false);
    expect(result.current.hasSubscription).toBe(true);
    expect(localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY)).not.toBeNull();
    unsubscribe.mockResolvedValue(true);
    act(() => result.current.disable());
    await waitFor(() => expect(result.current.hasSubscription).toBe(false));
  });

  it("unsubscribes locally during a server outage and retains credentials for deletion retry", async () => {
    getSubscription.mockResolvedValue(subscription);
    const { result } = renderHook(usePushNotifications);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.enabled).toBe(true));
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, options: { method?: string }) =>
      options.method === "DELETE"
        ? Response.json({ error: "Unavailable" }, { status: 503 })
        : defaultFetch(url, options));
    act(() => result.current.disable());
    await waitFor(() => expect(result.current.error).toMatch(/server record could not be deleted/));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.hasSubscription).toBe(false);
    expect(result.current.hasCredential).toBe(true);
    expect(localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY)).not.toBeNull();
    fetchMock.mockImplementation(defaultFetch);
    getSubscription.mockResolvedValue(null);
    act(() => result.current.disable());
    await waitFor(() => expect(result.current.hasCredential).toBe(false));
    expect(localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY)).toBeNull();
  });
});
