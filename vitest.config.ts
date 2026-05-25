import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import { cucumber } from "./src/index.ts";

const _require = createRequire(import.meta.url);

// @cucumber/cucumber does not expose lib/ internals in its package.json exports field.
// This plugin short-circuits Vite's resolver so Node.js loads them directly at runtime.
// Must be registered per-project because root-level plugins don't propagate to project envs.
const externalizePlugin = () => ({
  name: "externalize-cucumber-internals",
  enforce: "pre" as const,
  resolveId(id: string) {
    if (id.startsWith("@cucumber/cucumber/lib/")) {
      return { id: _require.resolve(id), external: true };
    }
  },
});

export default defineConfig({
  test: {
    environment: "node",
    deps: { interopDefault: false },
    coverage: {
      provider: "v8",
      reporter: ["json"],
      reportsDirectory: "coverage/vitest",
      include: ["src/vitest/**"],
    },
    projects: [
      {
        plugins: [externalizePlugin()],
        test: {
          name: "unit",
          sequence: { groupOrder: 0 },
          include: ["src/**/__tests__/**/*.test.ts"],
        },
      },
      {
        plugins: [
          externalizePlugin(),
          cucumber({
            import: [
              "features/support/**/*.ts",
              "features/step_definitions/**/*.ts",
            ],
          }),
        ],
        test: {
          name: "functional",
          sequence: { groupOrder: 1 },
          include: ["features/**/*.feature"],
        },
      },
    ],
  },
});
