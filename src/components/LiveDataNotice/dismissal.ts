// In-memory only: dismissal is shared across banner instances but resets on reload.
let dismissed = false;
const listeners = new Set<() => void>();

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
  listeners.forEach((l) => l());
}

/** Test-only: reset the shared dismissal state. */
export function resetLiveDataNoticeDismissal() {
  dismissed = false;
  listeners.forEach((l) => l());
}
