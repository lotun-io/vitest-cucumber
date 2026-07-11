import { cucumber } from "@lotun/vitest-cucumber";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cucumber({
      import: [
        "features/support/**/*.ts",
        "features/steps/**/*.ts",
      ],
    }),
  ],
  test: {
    include: ["features/**/*.feature"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
