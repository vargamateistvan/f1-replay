import { afterEach, describe, expect, it, vi } from "vitest";
import { loadScriptOnce, runWhenIdle } from "./idle";

type IdleWindow = Omit<Window, "requestIdleCallback"> & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
};

describe("runWhenIdle", () => {
  afterEach(() => {
    delete (window as unknown as IdleWindow).requestIdleCallback;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uses requestIdleCallback with a timeout once the page has loaded", () => {
    const ric = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    (window as unknown as IdleWindow).requestIdleCallback = ric;
    const callback = vi.fn();

    runWhenIdle(callback, 1234);

    expect(ric).toHaveBeenCalledWith(callback, { timeout: 1234 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("falls back to setTimeout without requestIdleCallback", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    runWhenIdle(callback);
    expect(callback).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("waits for the load event when the document is still loading", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const callback = vi.fn();

    runWhenIdle(callback);
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("loadScriptOnce", () => {
  afterEach(() => {
    document.getElementById("test-script")?.remove();
  });

  it("injects a single async script with the given attributes", () => {
    const first = loadScriptOnce("test-script", "https://example.com/a.js", {
      "data-name": "Widget",
    });
    const second = loadScriptOnce("test-script", "https://example.com/a.js");

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(document.querySelectorAll("#test-script")).toHaveLength(1);
    expect(first?.async).toBe(true);
    expect(first?.src).toBe("https://example.com/a.js");
    expect(first?.getAttribute("data-name")).toBe("Widget");
  });
});
