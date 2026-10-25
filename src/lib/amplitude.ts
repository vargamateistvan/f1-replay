import type * as AmplitudeSdk from "@amplitude/analytics-browser";
import { runWhenIdle } from "@/lib/idle";

/**
 * Lazy facade over the Amplitude Browser SDK.
 *
 * The SDK is loaded with a dynamic import once the page is idle, so it stays
 * out of the entry bundle. Events tracked before it finishes loading are
 * queued and replayed after `init`; when Amplitude isn't enabled (dev,
 * localhost, tests) calls are dropped.
 */
type AmplitudeModule = typeof AmplitudeSdk;
type PendingCall = (sdk: AmplitudeModule) => void;
export type AmplitudeEventProperties = Record<
  string,
  string | number | boolean | undefined
>;

const MAX_QUEUED_CALLS = 200;

// Amplitude browser API keys are public identifiers (shipped in every client).
export const AMPLITUDE_API_KEY =
  import.meta.env.VITE_AMPLITUDE_API_KEY?.trim() ||
  "319c270b0a7fc45b10e7d40031a50689";

let sdk: AmplitudeModule | null = null;
let enabled = false;
const queue: PendingCall[] = [];

function withAmplitude(fn: PendingCall): void {
  if (sdk) {
    fn(sdk);
    return;
  }
  if (!enabled) return;
  if (queue.length < MAX_QUEUED_CALLS) queue.push(fn);
}

/**
 * Enables Amplitude and loads the SDK once idle. Call synchronously during
 * bootstrap so events tracked before the SDK loads are queued, not dropped.
 */
export function loadAmplitude(appVersion?: string): void {
  if (enabled || !AMPLITUDE_API_KEY || typeof window === "undefined") return;
  enabled = true;
  runWhenIdle(() => {
    import("@amplitude/analytics-browser")
      .then((mod) => {
        mod.init(AMPLITUDE_API_KEY, {
          appVersion,
          // Page views and interactions are tracked explicitly (see
          // docs/ANALYTICS_EVENTS.md), so only keep sessions + attribution.
          autocapture: {
            attribution: true,
            sessions: true,
            pageViews: false,
            formInteractions: false,
            fileDownloads: false,
            elementInteractions: false,
          },
        });
        // Batched events would be lost when the tab closes; send them with
        // sendBeacon instead (Amplitude's recommended unload handling).
        window.addEventListener("pagehide", () => {
          mod.setTransport("beacon");
          mod.flush();
        });
        sdk = mod;
        for (const call of queue.splice(0)) call(mod);
      })
      .catch((err: unknown) => {
        enabled = false;
        queue.length = 0;
        console.warn("Amplitude failed to load", err);
      });
  });
}

export function amplitudeTrack(
  eventName: string,
  properties: AmplitudeEventProperties = {},
): void {
  withAmplitude((s) => {
    s.track(eventName, properties);
  });
}

/** Test-only: reset module state between tests. */
export function __resetAmplitudeForTests(): void {
  sdk = null;
  enabled = false;
  queue.length = 0;
}
