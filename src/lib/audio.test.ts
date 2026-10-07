import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decodeAudioData = vi.fn();

class FakeAudioContext {
  state = "running";
  decodeAudioData = decodeAudioData;
  resume = vi.fn(() => Promise.resolve());
}

async function loadFresh() {
  vi.resetModules();
  return import("./audio");
}

describe("loadSample", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    decodeAudioData.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes an available file once and reuses it", async () => {
    const buffer = { duration: 0.3 };
    decodeAudioData.mockResolvedValue(buffer);
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { loadSample } = await loadFresh();

    expect(await loadSample("/sounds/a.mp3")).toBe(buffer);
    expect(await loadSample("/sounds/a.mp3")).toBe(buffer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves null for a missing file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    const { loadSample } = await loadFresh();

    expect(await loadSample("/sounds/missing.mp3")).toBeNull();
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  it("resolves null when the response isn't decodable audio", async () => {
    decodeAudioData.mockRejectedValue(new DOMException("bad", "EncodingError"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response("<!doctype html>", { status: 200 })),
      ),
    );
    const { loadSample } = await loadFresh();

    expect(await loadSample("/sounds/spa-fallback.mp3")).toBeNull();
  });
});
