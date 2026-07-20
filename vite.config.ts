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
            if (
              moduleId.includes("/react/") ||
              moduleId.includes("/react-dom/") ||
              moduleId.includes("/react-router-dom/")
            ) {
              return "vendor-react";
            }
            if (
              moduleId.includes("/recharts/") ||
              moduleId.includes("/uplot/")
            ) {
              return "vendor-charts";
            }
            if (
              moduleId.includes("/@tanstack/react-query/") ||
              moduleId.includes("/zustand/")
            ) {
              return "vendor-query";
            }
            return undefined;
          }

          if (moduleId.includes("/src/components/LiveTiming/")) {
            return "feature-raceweekend-panels";
          }
          if (
            moduleId.includes("/src/components/TrackMap/") ||
            moduleId.includes("/src/hooks/useTrackMap") ||
            moduleId.includes("/src/hooks/useLocationChunks")
          ) {
            return "feature-raceweekend-panels";
          }
          if (
            moduleId.includes("/src/timeline/raceControl") ||
            moduleId.includes("/src/components/RaceControl/") ||
            moduleId.includes("/src/components/KeyMoments/") ||
            moduleId.includes("/src/components/RaceChapters/")
          ) {
            return "feature-raceweekend-panels";
          }
          if (moduleId.includes("/src/components/PlaybackBar/")) {
            return "feature-playback";
          }

          return undefined;
        },
      },
    },

    sourcemap: true,
  },
});
