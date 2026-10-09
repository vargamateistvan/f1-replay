import { IDLE_CALLBACK_TIMEOUT_MS } from "@/constants";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
};

/**
 * Runs `callback` after the window `load` event, once the main thread is idle.
 * Used to keep non-critical work (third-party scripts, optional SDK features)
 * off the critical rendering path.
 */
export function runWhenIdle(
  callback: () => void,
  timeoutMs: number = IDLE_CALLBACK_TIMEOUT_MS,
): void {
  if (typeof window === "undefined") return;
  const win = window as IdleWindow;

  const schedule = () => {
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(callback, { timeout: timeoutMs });
    } else {
      win.setTimeout(callback, 1);
    }
  };

  if (document.readyState === "complete") {
    schedule();
  } else {
    win.addEventListener("load", schedule, { once: true });
  }
}

/** Injects an async `<script>` tag once (keyed by `id`). */
export function loadScriptOnce(
  id: string,
  src: string,
  attributes: Record<string, string> = {},
): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(id);
  if (existing instanceof HTMLScriptElement) return existing;

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  for (const [key, value] of Object.entries(attributes)) {
    script.setAttribute(key, value);
  }
  document.body.appendChild(script);
  return script;
}
