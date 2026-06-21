/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional OpenF1 bearer token, sent as `Authorization: Bearer <key>`. */
  readonly VITE_OPENF1_API_KEY?: string;
  /** Sentry browser DSN used by @sentry/react bootstrap init. */
  readonly VITE_SENTRY_DSN?: string;
  /** Optional release identifier for Sentry events (e.g. git SHA). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
