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
      keyframes: {
        "rc-ticker-in": {
          "0%": { opacity: "0", transform: "translateY(60%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "rc-ticker-flash": {
          "0%": { opacity: "0.35" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "rc-ticker-in": "rc-ticker-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "rc-ticker-flash": "rc-ticker-flash 1.6s ease-out both",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
