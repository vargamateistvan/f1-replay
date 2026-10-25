import { STALE_CHUNK_RELOAD_COOLDOWN_MS } from "@/constants";

const RELOAD_AT_KEY = "__stale_chunk_reload_at";

// Chrome / Firefox / Safari wording for a failed dynamic import, plus Vite's
// CSS preload failure and the SPA fallback serving HTML for a missing chunk.
const STALE_CHUNK_ERROR_RE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css|is not a valid javascript mime type/i;

/** True when an error means a code-split chunk of the running build is gone. */
export function isStaleChunkError(value: unknown): boolean {
  if (value == null) return false;
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "object" && "message" in value
        ? String((value as { message: unknown }).message)
        : String(value);
  return STALE_CHUNK_ERROR_RE.test(message);
}

interface ReloadEnv {
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
  now: number;
}

let reloading = false;

/** True once a reload for a stale chunk has been started on this page. */
export function isReloadingForStaleChunk(): boolean {
  return reloading;
}

/** Test hook: forget an in-flight reload. */
export function resetStaleChunkReload(): void {
  reloading = false;
}

function defaultEnv(): ReloadEnv {
  let storage: ReloadEnv["storage"] = null;
  try {
    storage = globalThis.sessionStorage ?? null;
  } catch {
    // Storage can throw when blocked (private mode, sandboxed frames).
  }
  return {
    storage,
    reload: () => globalThis.location.reload(),
    now: Date.now(),
  };
}

/**
 * Reloads the page so it fetches the current build. Returns false when a
 * reload already happened within the cooldown (or can't be guarded), so the
 * caller surfaces the error rather than reloading forever.
 */
export function reloadForStaleChunk(env: ReloadEnv = defaultEnv()): boolean {
  if (reloading) return true;
  if (!env.storage) return false;
  try {
    const last = Number(env.storage.getItem(RELOAD_AT_KEY)) || 0;
    if (env.now - last < STALE_CHUNK_RELOAD_COOLDOWN_MS) return false;
    env.storage.setItem(RELOAD_AT_KEY, String(env.now));
  } catch {
    return false;
  }
  reloading = true;
  env.reload();
  return true;
}

/** Reloads for a stale-chunk error; returns true when a reload is under way. */
export function handleStaleChunkError(
  error: unknown,
  env?: ReloadEnv,
): boolean {
  return isStaleChunkError(error) && reloadForStaleChunk(env);
}

/**
 * Vite dispatches `vite:preloadError` for every failed dynamic import in a
 * production build. The error is left to propagate (no preventDefault) so
 * React.lazy rejects normally; the ErrorBoundary hides it while reloading.
 */
export function installStaleChunkReload(target: Window = globalThis.window): void {
  target.addEventListener("vite:preloadError", (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    handleStaleChunkError(payload);
  });
}
