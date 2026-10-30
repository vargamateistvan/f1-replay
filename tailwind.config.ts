import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import {
  BRAND_COLORS,
  FONT_SIZES,
  LETTER_SPACING,
  NEUTRAL_COLORS,
  TONE_COLORS,
  Z_LAYERS,
  type ThemeColor,
} from "./src/designTokens";

// Every themed colour becomes a CSS variable (`--color-<name>[-<slot>]`) set on
// :root and overridden under html.light, plus a Tailwind colour reading it.
const cssVars: { dark: Record<string, string>; light: Record<string, string> } = {
  dark: {},
  light: {},
};
const colorRef = (name: string, value: ThemeColor) => {
  cssVars.dark[`--color-${name}`] = value.dark;
  cssVars.light[`--color-${name}`] = value.light;
  return `rgb(var(--color-${name}) / <alpha-value>)`;
};
const colorGroup = (name: string, slots: Record<string, ThemeColor>) =>
  Object.fromEntries(
    Object.entries(slots).map(([slot, value]) => [
      slot,
      colorRef(slot === "DEFAULT" ? name : `${name}-${slot}`, value),
    ]),
  );

const colors = {
  ...Object.fromEntries(
    Object.entries(NEUTRAL_COLORS).map(([name, value]) => [name, colorRef(name, value)]),
  ),
  ...Object.fromEntries(
    Object.entries({ ...TONE_COLORS, ...BRAND_COLORS }).map(([name, slots]) => [
      name,
      colorGroup(name, slots),
    ]),
  ),
};

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Only design tokens: Tailwind's default palette (red-500, slate-300…) is
    // intentionally unavailable.
    colors: {
      inherit: "inherit",
      current: "currentColor",
      transparent: "transparent",
      white: "#ffffff",
      black: "#000000",
      ...colors,
    },
    extend: {
      fontSize: FONT_SIZES,
      letterSpacing: LETTER_SPACING,
      zIndex: Object.fromEntries(
        Object.entries(Z_LAYERS).map(([name, z]) => [name, String(z)]),
      ),
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
  plugins: [
    plugin(({ addBase, addVariant }) => {
      addBase({ ":root": cssVars.dark, "html.light": cssVars.light });
      // Light-mode-only styles, e.g. `light:shadow-none`. Prefer a themed token.
      addVariant("light", "html.light &");
    }),
  ],
} satisfies Config;
