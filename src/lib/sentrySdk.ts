// The only Sentry APIs the app uses. Importing these by name (instead of
// dynamically importing the whole `@sentry/react` namespace) lets the bundler
// tree-shake unused SDK features such as Replay and Feedback out of the chunk.
export {
  addIntegration,
  browserProfilingIntegration,
  browserTracingIntegration,
  captureException,
  captureMessage,
  consoleLoggingIntegration,
  init,
  lazyLoadIntegration,
  logger,
  metrics,
} from "@sentry/react";
