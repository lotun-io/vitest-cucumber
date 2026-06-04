import { defineConfig } from "vitest/config";
import { cucumber } from "./src/index.ts";

export default defineConfig({
  test: {
    environment: "node",
    deps: { interopDefault: false },
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          sequence: { groupOrder: 0 },
          include: ["src/**/__tests__/**/*.test.ts"],
        },
      },
      {
        plugins: [
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
