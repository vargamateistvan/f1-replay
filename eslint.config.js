import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

// Design-system guards for class strings (see src/designTokens.ts).
const HEX_CLASS = "-\\[#[0-9a-fA-F]{3,8}\\]";
const PX_FONT = "(^|[\\s:])text-\\[\\d+px\\]";
const DEFAULT_PALETTE =
  "(^|[\\s:])(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}";
const designSystemRule = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];
const DESIGN_SYSTEM_RULES = [
  ...designSystemRule(
    HEX_CLASS,
    "Use a design token class (bg-surface, text-purple-fg…) instead of an arbitrary hex colour.",
  ),
  ...designSystemRule(
    PX_FONT,
    "Use the type scale (text-micro, text-tiny, text-caption, text-small, text-compact, text-body, text-sm…).",
  ),
  ...designSystemRule(
    DEFAULT_PALETTE,
    "Tailwind's default palette is disabled; use a design token colour.",
  ),
];

export default [
  { ignores: ["dist", "coverage", "proxy/.wrangler", "proxy/node_modules"] },

  // ── Cloudflare Worker ──────────────────────────────────────────────────────
  // Separate block so we can supply CF runtime globals and skip React rules.
  // Type-checking is handled by tsc (proxy/tsconfig.json); ESLint only needs
  // to know about the global names to avoid false no-undef errors.
  {
    files: ["proxy/**/*.ts"],
    plugins: { "@typescript-eslint": tsPlugin },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        // Cloudflare Workers runtime globals (from @cloudflare/workers-types).
        // ESLint's no-undef doesn't read tsconfig types, so list them here.
        KVNamespace: "readonly",
        ExportedHandler: "readonly",
        HeadersInit: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
    },
  },

  // ── React SPA ──────────────────────────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["proxy/**"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-restricted-syntax": ["error", ...DESIGN_SYSTEM_RULES],
    },
  },
];
