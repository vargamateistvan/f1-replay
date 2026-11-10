import { useEffect, type ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";
import { createJSONStorage } from "zustand/middleware";
import { useSettings } from "../src/stores/settings";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/inter/latin-900.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "../src/index.css";
import "./preview.css";

// Stories use fresh, non-persisted preferences instead of saved application settings.
useSettings.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })),
});
useSettings.setState({
  ...useSettings.getInitialState(),
  mapStartLightsSound: false,
  mapShowDriverHeatmap: false,
  mapWeatherEffectsEnabled: true,
  mapShowPitLaneStatus: true,
});

function ThemePreview({
  theme,
  units,
  children,
}: {
  theme: string;
  units: "metric" | "imperial";
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    useSettings.setState({ lightMode: theme === "light", metricSystem: units });
    return () => document.documentElement.classList.remove("light");
  }, [theme, units]);
  return <div className="bg-track p-4 text-fg">{children}</div>;
}

const preview: Preview = {
  tags: ["autodocs"],
  initialGlobals: { theme: "dark", units: "metric" },
  globalTypes: {
    theme: {
      description: "Application theme",
      toolbar: {
        icon: "circlehollow",
        items: ["dark", "light"],
        dynamicTitle: true,
      },
    },
    units: {
      description: "Display units",
      toolbar: {
        icon: "globe",
        items: ["metric", "imperial"],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    options: { storySort: { order: ["UI", "Brand", "Feedback", "Racing", "Tracks", "Charts", "Results", "Standings", "Profiles"] } },
  },
  decorators: [
    (Story, context) => (
      <ThemePreview theme={context.globals.theme} units={context.globals.units}>
        <Story />
      </ThemePreview>
    ),
  ],
};

export default preview;
