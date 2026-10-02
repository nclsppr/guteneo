import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      ".wrangler/**",
      "playwright-report/**",
      "test-results/**",
      // Independent Remotion package with its own ESLint version and checks.
      "videos/guteneo-film/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Stale closures in effects can repeat or skip a read after a state
    // change; keep the two classic hook rules blocking for the web app.
    files: ["apps/web/src/**/*.ts", "apps/web/src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
