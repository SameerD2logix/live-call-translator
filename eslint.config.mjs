import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "apps/web/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
    },
  },
  {
    // The AudioWorklet runs in its own global scope.
    files: ["apps/web/public/worklets/**/*.js"],
    languageOptions: {
      globals: { AudioWorkletProcessor: "readonly", registerProcessor: "readonly", sampleRate: "readonly" },
    },
  },
);
