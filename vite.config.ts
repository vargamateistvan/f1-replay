import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { env } from "node:process";

const sentryRelease = env.SENTRY_RELEASE;

export default defineConfig({
  base: "/",
  plugins: [
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
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts", "uplot"],
          "vendor-query": ["@tanstack/react-query", "zustand"],
        },
      },
    },

    sourcemap: true,
  },
});
