import { afterEach, describe, expect, it } from "vitest";
import {
  loadYouTubeApi,
  resetYouTubeApiForTests,
  YOUTUBE_IFRAME_API_URL,
} from "./youtubePlayer";

const script = () =>
  document.getElementById("youtube-iframe-api") as HTMLScriptElement | null;

describe("loadYouTubeApi", () => {
  afterEach(() => {
    resetYouTubeApiForTests();
    script()?.remove();
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
  });

  it("injects the IFrame API once and resolves when it's ready", async () => {
    const first = loadYouTubeApi();
    const second = loadYouTubeApi();
    expect(second).toBe(first);
    expect(script()?.src).toBe(YOUTUBE_IFRAME_API_URL);

    const Player = class {};
    window.YT = { Player } as unknown as Window["YT"];
    window.onYouTubeIframeAPIReady?.();
    await expect(first).resolves.toMatchObject({ Player });
    await expect(loadYouTubeApi()).resolves.toMatchObject({ Player });
  });

  it("rejects and allows a retry when the script fails to load", async () => {
    const attempt = loadYouTubeApi();
    script()?.dispatchEvent(new Event("error"));
    await expect(attempt).rejects.toThrow("failed to load");
    expect(script()).toBeNull();

    void loadYouTubeApi().catch(() => {});
    expect(script()).not.toBeNull();
  });
});
