import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  track: vi.fn(),
  setTransport: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("@amplitude/analytics-browser", () => sdk);
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
    for (const fn of Object.values(sdk)) fn.mockReset();
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
});
