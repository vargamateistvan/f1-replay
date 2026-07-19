import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/inter/latin-900.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./index.css";
import App from "./App.tsx";

const sentryDsn =
  import.meta.env.VITE_SENTRY_DSN ||
  "https://6910191e596b31cc3bc8e8a0eac15f82@o4511602563940352.ingest.de.sentry.io/4511602567151696";

function isCrossOriginFrameError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value);
  return /blocked a frame with origin|cross-origin frame|secure connection to the server cannot be made|certificate for this server is invalid/i.test(
    message,
  );
}

Sentry.init({
  dsn: sentryDsn,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: []
  },
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
    Sentry.replayIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  enableLogs: true,
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  // Session Replay
  replaysSessionSampleRate: import.meta.env.DEV ? 1 : 0.1,
  replaysOnErrorSampleRate: 1,
});

if (typeof globalThis.document !== "undefined") {
  const policy = (
    globalThis.document as Document & {
      policy?: { allowedFeatures?: () => string[] };
    }
  ).policy;
  const allowed = policy?.allowedFeatures?.();

  if (Array.isArray(allowed) && !allowed.includes("js-profiling")) {
    Sentry.logger.warn("Document-Policy js-profiling is not enabled", {
      log_source: "profiling",
      mode: import.meta.env.MODE,
    });
  }
}

Sentry.logger.info("App bootstrap initialized", {
  log_source: "bootstrap",
});

if (typeof globalThis.performance !== "undefined") {
  Sentry.metrics.gauge(
    "page_load_time",
    Math.round(globalThis.performance.now()),
  );
}

// Mobile Safari error prevention and logging
if (typeof globalThis.window !== "undefined") {
  // Store recent errors in sessionStorage for debugging
  const storeError = (msg: string) => {
    try {
      const errors = JSON.parse(sessionStorage.getItem("__app_errors") || "[]");
      errors.push({ msg, time: new Date().toISOString() });
      // Keep only last 10 errors
      if (errors.length > 10) errors.shift();
      sessionStorage.setItem("__app_errors", JSON.stringify(errors));
    } catch (e) {
      Sentry.logger.error("Failed to persist recent app error", {
        log_source: "bootstrap",
      });
      console.error("Failed to store error:", e);
    }
  };

  // Intercept all errors
  globalThis.addEventListener("error", (event) => {
    const msg = event.error?.message || event.message || "Unknown error";
    if (isCrossOriginFrameError(event.error ?? msg)) {
      event.preventDefault();
      return true;
    }
    storeError(`Error: ${msg}`);
    Sentry.logger.error("Unhandled window error", {
      log_source: "window_error",
      message: msg,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
    if (event.error instanceof Error) {
      Sentry.captureException(event.error, {
        tags: { log_source: "window_error" },
      });
    } else {
      Sentry.captureMessage(msg, {
        level: "error",
        tags: { log_source: "window_error" },
      });
    }
    console.log("GlobalError:", msg);
    event.preventDefault();
    return true;
  });

  globalThis.addEventListener("unhandledrejection", (event) => {
    const msg =
      event.reason?.message || String(event.reason) || "Promise rejection";
    if (isCrossOriginFrameError(event.reason ?? msg)) {
      event.preventDefault();
      return true;
    }
    storeError(`Rejection: ${msg}`);
    Sentry.logger.error("Unhandled promise rejection", {
      log_source: "promise_rejection",
      message: msg,
    });
    if (event.reason instanceof Error) {
      Sentry.captureException(event.reason, {
        tags: { log_source: "promise_rejection" },
      });
    } else {
      Sentry.captureMessage(msg, {
        level: "error",
        tags: { log_source: "promise_rejection" },
      });
    }
    console.log("GlobalRejection:", msg);
    event.preventDefault();
    return true;
  });

  // Also store errors globally for ErrorDisplay component access
  (
    globalThis as typeof globalThis & Record<string, unknown>
  ).__getStoredErrors = () => {
    try {
      return JSON.parse(sessionStorage.getItem("__app_errors") || "[]");
    } catch {
      // Ignore parsing errors
      return [];
    }
  };
}

// Initialize app
const root = document.getElementById("root");
if (root) {
  try {
    createRoot(root).render(<App />);
  } catch (e) {
    // Catch any errors during root render
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Critical error during root render:", msg);
    Sentry.captureException(e, {
      tags: { log_source: "root_render_error" },
      level: "fatal",
    });
    // Display fallback UI
    root.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; min-height:100vh; background:#1a1a1a; color:#fff; font-family:monospace; text-align:center; padding:20px;">
        <div>
          <h1 style="color:#e80000; margin-bottom:10px;">Critical Error</h1>
          <p style="margin-bottom:10px;">${msg}</p>
          <p style="color:#999; font-size:12px;">Refreshing page or clearing cache may help.</p>
          <button onclick="location.href='/'" style="margin-top:20px; padding:10px 20px; background:#e80000; color:white; border:none; border-radius:4px; cursor:pointer;">Go Home</button>
        </div>
      </div>
    `;
  }
} else {
  Sentry.logger.error("Root element not found during app bootstrap", {
    log_source: "bootstrap",
  });
  Sentry.captureMessage("Root element not found", {
    level: "error",
    tags: { log_source: "bootstrap" },
  });
  console.error("Root element not found");
}
