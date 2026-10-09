import type * as SentrySdk from "./sentrySdk";

/**
 * Lazy facade over the Sentry SDK.
 *
 * The SDK is ~170 KB minified, so it's loaded with a dynamic import in
 * parallel with the first render instead of sitting in the entry bundle.
 * Calls made before it finishes loading are queued and replayed; when Sentry
 * is disabled (dev, localhost, tests) calls are dropped, matching the SDK's
 * own no-op behaviour when it hasn't been initialised.
 */
type SentryModule = typeof SentrySdk;
type PendingCall = (sdk: SentryModule) => void;

const MAX_QUEUED_CALLS = 200;

let sdk: SentryModule | null = null;
let enabled = false;
const queue: PendingCall[] = [];

export function withSentry(fn: PendingCall): void {
  if (sdk) {
    fn(sdk);
    return;
  }
  if (!enabled) return;
  if (queue.length < MAX_QUEUED_CALLS) queue.push(fn);
}

/**
 * Loads the SDK, runs `init` with it, then flushes queued calls. Must be called
 * synchronously during bootstrap so early calls are queued rather than dropped.
 */
export function loadSentry(init: (sdk: SentryModule) => void): Promise<void> {
  enabled = true;
  return import("./sentrySdk")
    .then((mod) => {
      init(mod);
      sdk = mod;
      for (const call of queue.splice(0)) call(mod);
    })
    .catch((err: unknown) => {
      enabled = false;
      queue.length = 0;
      console.warn("Sentry failed to load", err);
    });
}

type LogAttributes = Parameters<SentryModule["logger"]["info"]>[1];

export const Sentry = {
  captureException: (...args: Parameters<SentryModule["captureException"]>) =>
    withSentry((s) => {
      s.captureException(...args);
    }),
  captureMessage: (...args: Parameters<SentryModule["captureMessage"]>) =>
    withSentry((s) => {
      s.captureMessage(...args);
    }),
  logger: {
    info: (message: string, attributes?: LogAttributes) =>
      withSentry((s) => s.logger.info(message, attributes)),
    warn: (message: string, attributes?: LogAttributes) =>
      withSentry((s) => s.logger.warn(message, attributes)),
    error: (message: string, attributes?: LogAttributes) =>
      withSentry((s) => s.logger.error(message, attributes)),
  },
  metrics: {
    gauge: (...args: Parameters<SentryModule["metrics"]["gauge"]>) =>
      withSentry((s) => s.metrics.gauge(...args)),
    distribution: (
      ...args: Parameters<SentryModule["metrics"]["distribution"]>
    ) => withSentry((s) => s.metrics.distribution(...args)),
  },
};

/** Test-only: reset module state between tests. */
export function __resetSentryForTests(): void {
  sdk = null;
  enabled = false;
  queue.length = 0;
}
