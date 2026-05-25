import pluginN from "eslint-plugin-n";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["coverage", "lotun-almost", "packages/cli", "**/generated"],
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
        customConditions: ["source"],
        typescriptExtensionMap: [[".ts", ".ts"]],
        resolverConfig: {
          conditionNames: ["source", "node", "import", "require", "types"],
        },
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
  {
    files: ["**/src/**/__tests__/**/*.ts"],
    rules: {
      "n/no-unpublished-import": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
