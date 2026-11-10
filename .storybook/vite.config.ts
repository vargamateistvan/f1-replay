import { defineConfig } from "vite";

// Keep app-only plugins, proxy configuration and telemetry out of Storybook.
export default defineConfig({
  esbuild: { jsx: "automatic" },
});
