/// <reference types="vitest/config" />
import { cucumber } from "@lotun/vitest-cucumber";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // Storybook's stories as tests (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)
          // Its tags (a story's own, its feature's Gherkin tags among them) filter its tests:
          // `pnpm test:smoke` runs only the `@smoke` ones.
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            ...(process.env.TAGS && { tags: { include: process.env.TAGS.split(",") } }),
          }),
          // Feature files as stories (Storybook's `stories` lists them). Its options are
          // `.storybook/cucumber.config.ts`'s, which Storybook reads too.
          cucumber(),
        ],
        test: {
          name: "storybook",
          // Storybook's addon turns file writing off unless set: without it, Vitest drops the data
          // of a step's attachments (`this.attach`), keeping their names.
          api: { allowWrite: true },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
