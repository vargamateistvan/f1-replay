import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  track: vi.fn(),
  setTransport: vi.fn(),
  flush: vi.fn(),
  add: vi.fn(),
}));

const replayPlugin = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

const settings = vi.hoisted(() => {
  let enabled = false;
  let listener:
    | ((
        state: { amplitudeSessionReplayEnabled: boolean },
        previous: { amplitudeSessionReplayEnabled: boolean },
      ) => void)
    | null = null;
  return {
    getState: vi.fn(() => ({ amplitudeSessionReplayEnabled: enabled })),
    subscribe: vi.fn((callback: typeof listener) => {
      listener = callback;
      return () => {
        listener = null;
      };
    }),
    setEnabled(value: boolean) {
      const previous = { amplitudeSessionReplayEnabled: enabled };
      enabled = value;
      listener?.({ amplitudeSessionReplayEnabled: enabled }, previous);
    },
    reset() {
      enabled = false;
      listener = null;
    },
  };
});

vi.mock("@amplitude/analytics-browser", () => sdk);
vi.mock("@amplitude/plugin-session-replay-browser", () => ({
  sessionReplayPlugin: vi.fn(() => replayPlugin),
}));
vi.mock("@/stores/settings", () => ({
  useSettings: {
    getState: settings.getState,
    subscribe: settings.subscribe,
  },
}));
vi.mock("@/lib/idle", () => ({
  runWhenIdle: (callback: () => void) => callback(),
}));

import {
  __resetAmplitudeForTests,
  amplitudeTrack,
  loadAmplitude,
} from "./amplitude";

async function flushImport() {
  await vi.dynamicImportSettled();
}

describe("amplitude", () => {
  beforeEach(() => {
    __resetAmplitudeForTests();
    settings.reset();
    for (const fn of Object.values(sdk)) fn.mockReset();
    for (const fn of Object.values(replayPlugin)) fn.mockReset();
    replayPlugin.start.mockResolvedValue(undefined);
    sdk.add.mockReturnValue({ promise: Promise.resolve() });
  });

  afterEach(() => {
    __resetAmplitudeForTests();
  });

  it("drops events when Amplitude was never enabled", async () => {
    amplitudeTrack("nav_click", { destination: "/settings" });
    await flushImport();

    expect(sdk.track).not.toHaveBeenCalled();
  });

  it("initialises the SDK with the app version and limited autocapture", async () => {
    loadAmplitude("1.2.3");
    await flushImport();

    expect(sdk.init).toHaveBeenCalledWith(
      "319c270b0a7fc45b10e7d40031a50689",
      expect.objectContaining({
        appVersion: "1.2.3",
        autocapture: expect.objectContaining({
          sessions: true,
          attribution: true,
          pageViews: false,
          formInteractions: false,
          fileDownloads: false,
          elementInteractions: false,
        }),
      }),
    );
  });

  it("queues events tracked before the SDK loads and replays them after init", async () => {
    loadAmplitude();
    amplitudeTrack("page_view", { page_path: "/telemetry" });
    expect(sdk.track).not.toHaveBeenCalled();

    await flushImport();

    expect(sdk.track).toHaveBeenCalledWith("page_view", {
      page_path: "/telemetry",
    });
    expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.track.mock.invocationCallOrder[0],
    );

    amplitudeTrack("nav_click");
    expect(sdk.track).toHaveBeenLastCalledWith("nav_click", {});
  });

  it("flushes with sendBeacon when the page is hidden", async () => {
    loadAmplitude();
    await flushImport();

    window.dispatchEvent(new Event("pagehide"));

    expect(sdk.setTransport).toHaveBeenCalledWith("beacon");
    expect(sdk.flush).toHaveBeenCalled();
  });

  it("adds Session Replay with a 10% sample and medium input masking", async () => {
    settings.setEnabled(true);
    loadAmplitude();
    await flushImport();

    const { sessionReplayPlugin } = await import(
      "@amplitude/plugin-session-replay-browser"
    );
    expect(sessionReplayPlugin).toHaveBeenCalledWith({
      sampleRate: 0.1,
      privacyConfig: { defaultMaskLevel: "medium" },
    });
    expect(sdk.add).toHaveBeenCalledWith(replayPlugin);
  });

  it("starts and stops replay when the persisted setting changes", async () => {
    loadAmplitude();
    await flushImport();
    settings.setEnabled(true);
    await flushImport();
    settings.setEnabled(false);

    expect(sdk.add).toHaveBeenCalledTimes(1);
    expect(replayPlugin.stop).toHaveBeenCalledTimes(1);

    settings.setEnabled(true);
    expect(replayPlugin.start).toHaveBeenCalledTimes(1);
  });

  it("does not load Session Replay when the user has opted out", async () => {
    settings.setEnabled(false);
    loadAmplitude();
    await flushImport();

    expect(sdk.add).not.toHaveBeenCalled();
  });
});
