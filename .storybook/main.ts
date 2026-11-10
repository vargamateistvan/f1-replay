import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  staticDirs: ["../public"],
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
  core: { disableTelemetry: true },
  async viteFinal(config) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(config, {
      resolve: {
        alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
        dedupe: ["react", "react-dom"],
      },
    });
  },
};

export default config;
