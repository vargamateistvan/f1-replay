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

Sentry.init({
  dsn: "https://6910191e596b31cc3bc8e8a0eac15f82@o4511602563940352.ingest.de.sentry.io/4511602567151696",
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: []
  },
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1,
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
});

// Mobile Safari error prevention and logging
if (typeof window !== "undefined") {
  // Store recent errors in sessionStorage for debugging
  const storeError = (msg: string) => {
    try {
      const errors = JSON.parse(sessionStorage.getItem("__app_errors") || "[]");
      errors.push({ msg, time: new Date().toISOString() });
      // Keep only last 10 errors
      if (errors.length > 10) errors.shift();
      sessionStorage.setItem("__app_errors", JSON.stringify(errors));
    } catch (e) {
      console.error("Failed to store error:", e);
    }
  };

  // Intercept all errors
  window.addEventListener("error", (event) => {
    const msg = event.error?.message || event.message || "Unknown error";
    storeError(`Error: ${msg}`);
    console.log("GlobalError:", msg);
    event.preventDefault();
    return true;
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg =
      event.reason?.message || String(event.reason) || "Promise rejection";
    storeError(`Rejection: ${msg}`);
    console.log("GlobalRejection:", msg);
    event.preventDefault();
    return true;
  });

  // Also store errors globally for ErrorDisplay component access
  (window as unknown as Record<string, unknown>).__getStoredErrors = () => {
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
  createRoot(root).render(<App />);
} else {
  console.error("Root element not found");
}
