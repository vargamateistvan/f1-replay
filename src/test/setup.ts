import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof globalThis.matchMedia;
}

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:test-url";
}

if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => undefined;
}

if (!globalThis.HTMLMediaElement.prototype.play) {
  vi.spyOn(globalThis.HTMLMediaElement.prototype, "play").mockImplementation(
    () => Promise.resolve(),
  );
}

if (!globalThis.HTMLMediaElement.prototype.pause) {
  vi.spyOn(globalThis.HTMLMediaElement.prototype, "pause").mockImplementation(
    () => undefined,
  );
}
