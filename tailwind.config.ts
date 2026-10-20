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
      keyframes: {
        // Race control: a message slides in with a brief red wash as the playhead crosses it
        "rc-enter": {
          "0%": {
            opacity: "0",
            transform: "translateY(-4px)",
            backgroundColor: "rgba(232, 0, 45, 0.25)",
          },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Team radio: level-meter bars while a clip plays
        "radio-bar": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "rc-enter": "rc-enter 600ms ease-out",
        "radio-bar": "radio-bar 700ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
