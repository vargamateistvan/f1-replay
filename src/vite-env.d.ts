/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional OpenF1 bearer token, sent as `Authorization: Bearer <key>`. */
  readonly VITE_OPENF1_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
