import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

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
    },
  },
];
