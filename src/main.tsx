import { StrictMode } from "react";
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

const loadScript = (src: string, attrs: Record<string, string> = {}) => {
  if (document.querySelector(`script[src="${src}"]`)) return;

  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  Object.entries(attrs).forEach(([key, value]) =>
    script.setAttribute(key, value),
  );
  document.body.appendChild(script);
};

const runWhenIdle = (cb: () => void) => {
  const withIdle = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => void;
  };

  if (typeof withIdle.requestIdleCallback === "function") {
    withIdle.requestIdleCallback(cb, { timeout: 2500 });
    return;
  }

  globalThis.setTimeout(cb, 1200);
};

const initDeferredThirdParties = () => {
  if (!import.meta.env.PROD) return;

  runWhenIdle(() => {
    loadScript("https://www.googletagmanager.com/gtag/js?id=G-R9T6QJHL5X");

    const win = window as Window & {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    win.dataLayer = win.dataLayer || [];
    win.gtag = function gtag(...args: unknown[]) {
      win.dataLayer?.push(args);
    };
    win.gtag("js", new Date());
    win.gtag("config", "G-R9T6QJHL5X");

    loadScript("https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js", {
      "data-name": "BMC-Widget",
      "data-cfasync": "false",
      "data-id": "matt_varga",
      "data-description": "Support me on Buy me a coffee!",
      "data-message": "",
      "data-color": "#E8002D",
      "data-position": "Right",
      "data-x_margin": "18",
      "data-y_margin": "18",
    });
  });
};

initDeferredThirdParties();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
