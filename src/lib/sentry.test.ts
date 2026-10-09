import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  metrics: { gauge: vi.fn(), distribution: vi.fn() },
}));

vi.mock("@sentry/react", () => sdk);

import {
  __resetSentryForTests,
  loadSentry,
  Sentry,
  withSentry,
} from "./sentry";

describe("lazy Sentry facade", () => {
  afterEach(() => {
    __resetSentryForTests();
    vi.clearAllMocks();
  });

  it("drops calls when Sentry has not been enabled", () => {
    const fn = vi.fn();
    withSentry(fn);
    Sentry.captureMessage("ignored");
    expect(fn).not.toHaveBeenCalled();
    expect(sdk.captureMessage).not.toHaveBeenCalled();
  });

  it("queues calls made while loading and flushes them after init", async () => {
    const loading = loadSentry((mod) => mod.init({ dsn: "x" }));

    const err = new Error("boom");
    Sentry.captureException(err, { tags: { a: "b" } });
    Sentry.logger.warn("warned", { log_source: "test" });
    Sentry.metrics.distribution("response_time", 12);
    expect(sdk.captureException).not.toHaveBeenCalled();

    await loading;

    expect(sdk.init).toHaveBeenCalledBefore(sdk.captureException);
    expect(sdk.captureException).toHaveBeenCalledWith(err, {
      tags: { a: "b" },
    });
    expect(sdk.logger.warn).toHaveBeenCalledWith("warned", {
      log_source: "test",
    });
    expect(sdk.metrics.distribution).toHaveBeenCalledWith("response_time", 12);
  });

  it("calls the SDK directly once loaded", async () => {
    await loadSentry(() => {});
    Sentry.captureMessage("direct", { level: "error" });
    Sentry.logger.info("info");
    Sentry.metrics.gauge("page_load_time", 5);
    expect(sdk.captureMessage).toHaveBeenCalledWith("direct", {
      level: "error",
    });
    expect(sdk.logger.info).toHaveBeenCalledWith("info", undefined);
    expect(sdk.metrics.gauge).toHaveBeenCalledWith("page_load_time", 5);
  });

  it("caps the number of queued calls while loading", async () => {
    const loading = loadSentry(() => {});
    for (let i = 0; i < 500; i++) Sentry.captureMessage(`m${i}`);
    await loading;
    expect(sdk.captureMessage).toHaveBeenCalledTimes(200);
  });
});
