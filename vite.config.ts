import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { cwd, env } from "node:process";

const sentryRelease = env.SENTRY_RELEASE;

const DEFAULT_OPENF1_API_BASE = "https://api.openf1.org/v1";

/**
 * Adds a `preconnect` hint for the OpenF1 API origin (which may be a proxy set
 * via VITE_OPENF1_API_BASE) so the first data requests skip DNS/TLS setup.
 */
function apiPreconnectPlugin(mode: string): Plugin {
  const viteEnv = loadEnv(mode, cwd(), "VITE_");
  const apiBase = viteEnv.VITE_OPENF1_API_BASE || DEFAULT_OPENF1_API_BASE;
  let origin: string | null = null;
  try {
    origin = new URL(apiBase).origin;
  } catch {
    // Relative base (e.g. the dev proxy) — same origin, nothing to preconnect.
  }
  return {
    name: "api-preconnect",
    transformIndexHtml() {
      if (!origin) return [];
      return [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: origin, crossorigin: "" },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [
    apiPreconnectPlugin(mode),
    react(),
    sentryVitePlugin({
      org: "f1-replay",
      project: "f1-replay",
      ...(sentryRelease
        ? {
            release: {
              name: sentryRelease,
            },
          }
        : {}),
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/openf1": {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openf1/, ""),
        secure: true,
        target: "https://api.openf1.org",
      },
    },
    headers: {
      "Document-Policy": "js-profiling",
    },
  },
  preview: {
    headers: {
      "Document-Policy": "js-profiling",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");

          if (moduleId.includes("node_modules")) {
            // Match on the package root so e.g. `@sentry/react` isn't
            // mistaken for `react` and dragged into the vendor-react chunk.
            const inPackage = (...names: string[]) =>
              names.some((name) => moduleId.includes(`/node_modules/${name}/`));

            if (
              inPackage(
                "react",
                "react-dom",
                "scheduler",
                "react-router",
                "react-router-dom",
                "@remix-run/router",
              )
            ) {
              return "vendor-react";
            }
            // Separate chunks: Telemetry/FocusedTelemetry only need uPlot,
            // and the Standings/gap charts only need recharts.
            if (inPackage("recharts")) {
              return "vendor-recharts";
            }
            if (inPackage("uplot")) {
              return "vendor-uplot";
            }
            if (inPackage("@tanstack/react-query", "zustand")) {
              return "vendor-query";
            }
            return undefined;
          }

          // App code is split by the lazy route boundaries in routes.tsx.
          // Forcing src/ modules into named chunks here pulls their shared
          // dependencies into the entry's preload graph for every route.
          return undefined;
        },
      },
    },

    sourcemap: true,
  },
}));
