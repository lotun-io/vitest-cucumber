import { cucumber } from "@lotun/vitest-cucumber";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.stories.*"],
    },
    projects: [
      // Storybook component tests
      {
        define: {
          // Inject project root as a constant so browser code can resolve
          // feature file paths to absolute filesystem paths.
          __POC_ROOT__: JSON.stringify(process.cwd()),
        },
        plugins: [
          storybookTest({
            configDir: ".storybook",
            storybookUrl: "http://localhost:6006",
            storybookScript: "pnpm storybook --no-open",
          }),
          cucumber({
            import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
        },
      },
    ],
  },
});
