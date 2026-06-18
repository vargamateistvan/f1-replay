import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        f1red: "#E8002D",
        track: "rgb(var(--color-track) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        // Sector / lap-time tier colours matching F1.com live timing
        "f1-purple": "#9b59f5",
        "f1-yellow": "#f5d400",
        "f1-green": "#39b54a",
        // Tyre compound colours
        "tyre-soft": "#e8002d",
        "tyre-med": "#f5a623",
        "tyre-hard": "#e0e0e0",
        "tyre-inter": "#39b54a",
        "tyre-wet": "#1e90ff",
        // Flag banner colours
        "flag-yellow": "#f5d400",
        "flag-sc": "#f5a623",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
