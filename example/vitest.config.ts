import { cucumber } from "@lotun/vitest-cucumber";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // Browser mode
      {
        plugins: [
          cucumber({
            import: [
              "features/browser/support/**/*.ts",
              "features/browser/steps/**/*.ts",
            ],
          }),
        ],
        test: {
          name: "browser",
          include: ["features/browser/**/*.feature"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      // Node.js
      {
        plugins: [
          cucumber({
            import: [
              "features/node/support/**/*.ts",
              "features/node/steps/**/*.ts",
            ],
          }),
        ],
        test: {
          name: "node",
          environment: "node",
          include: ["features/node/**/*.feature"],
          isolate: false,
        },
      },
      // Node.js with playwright
      {
        plugins: [
          cucumber({
            import: [
              "features/playwright/support/**/*.ts",
              "features/playwright/steps/**/*.ts",
            ],
          }),
        ],
        test: {
          name: "node-playwright",
          environment: "node",
          include: ["features/playwright/**/*.feature"],
          isolate: false,
        },
      },
    ],
  },
});
