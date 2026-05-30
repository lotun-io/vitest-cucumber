import pluginN from "eslint-plugin-n";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [],
  },
  {
    files: ["src/**/*.ts"],
    extends: [
      ...tseslint.configs.recommended,
      pluginN.configs["flat/recommended-module"],
    ],
    settings: {
      n: {
        version: ">=24.0.0",
        typescriptExtensionMap: [[".ts", ".ts"]],
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "n/file-extension-in-import": ["error", "always"],
    },
  },
);
