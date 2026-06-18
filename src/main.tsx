import { createRoot } from "react-dom/client";
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
