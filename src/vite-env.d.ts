/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional OpenF1 bearer token, sent as `Authorization: Bearer <key>`. */
  readonly VITE_OPENF1_API_KEY?: string;
  /** Optional OpenF1 MQTT/WebSocket access token (OAuth2 access token). */
  readonly VITE_OPENF1_MQTT_TOKEN?: string;
  /** Optional OpenF1 MQTT username; can be any non-empty string. */
  readonly VITE_OPENF1_MQTT_USERNAME?: string;
  /** Optional MQTT over WSS URL override. */
  readonly VITE_OPENF1_MQTT_WSS_URL?: string;
  /** Sentry browser DSN used by @sentry/react bootstrap init. */
  readonly VITE_SENTRY_DSN?: string;
  /** Optional Google Analytics 4 Measurement ID (for example G-XXXXXXXXXX). */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Optional release identifier for Sentry events (e.g. git SHA). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
