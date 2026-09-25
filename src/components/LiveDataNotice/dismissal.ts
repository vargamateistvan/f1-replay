const DISMISS_KEY = "f1replay:live-data-notice-dismissed";
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

let dismissed = readDismissed();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDismissed() {
  return dismissed;
}

export function dismiss() {
  dismissed = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage unavailable (private mode) — dismissal still applies in memory.
  }
  listeners.forEach((l) => l());
}

/** Test-only: reset the shared dismissal state. */
export function resetLiveDataNoticeDismissal() {
  dismissed = false;
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}
