import pluginN from "eslint-plugin-n";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Build output: Storybook's static builds (`storybook/`, `example/`), the docs site's (`docs/`);
  // the fixtures, spikes and e2e scenarios' projects (`tmp/`).
  globalIgnores(["**/storybook-static/", "docs/.next/", "docs/out/", "tmp/"]),
  {
    // The plugin, and the harness that runs it: the e2e scenarios, the compatibility kit.
    files: ["src/**/*.ts", "e2e/**/*.ts", "compatibility/**/*.ts"],
    extends: [
      ...tseslint.configs.strict,
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
      "n/prefer-node-protocol": "error",
      // A property left out of a rest copy (`const { a: _a, ...rest } = object`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Runs in the page (browser mode): no Node.js, nothing of main's or node mode's, and cucumber's
    // types only (the page's `@cucumber/cucumber` is the plugin's stand-in, `worker/cucumber/page.ts`).
    files: ["src/worker/**/*.ts", "src/utils/**/*.ts", "src/types/**/*.ts"],
    ignores: ["src/worker/node/**", "src/**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@cucumber/cucumber",
              allowTypeImports: true,
              message:
                "Types only: in the page, `@cucumber/cucumber` is the plugin's stand-in.",
            },
          ],
          patterns: [
            {
              group: ["node:*"],
              allowTypeImports: true,
              message: "Runs in the page (browser mode): no Node.js.",
            },
            {
              group: ["**/core/**", "**/node/**"],
              allowTypeImports: true,
              message:
                "Runs in the page (browser mode): main's and node mode's code needs Node.js.",
            },
            {
              // Any other package: Vite's scanner can't see the page's imports (behind `.feature`
              // files), so one found mid-run reloads the page; pre-bundled ones only.
              regex:
                "^(?!\\.|node:|@cucumber/cucumber(/|$)|vitest$|vitest/browser$|uuid$|@vitest/utils/(serialize|display)$|@cucumber/(core|cucumber-expressions|messages|tag-expressions)$)",
              allowTypeImports: true,
              message:
                "Runs in the page (browser mode): a package must be pre-bundled first, in `optimizeDeps.include` (`core/browserPlugin.ts`), or imported for its types only.",
            },
            {
              group: ["@cucumber/cucumber/*"],
              allowTypeImports: true,
              message: "Types only: cucumber's runner doesn't run in the page.",
            },
          ],
        },
      ],
    },
  },
);
