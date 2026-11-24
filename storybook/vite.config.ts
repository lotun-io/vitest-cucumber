/// <reference types="vitest/config" />
// The repo's root features as Storybook stories (`../notes/storybook.md`): the plugin from the repo's
// `src/` (this is a package of the repo's pnpm workspace, `"@lotun/vitest-cucumber": "workspace:*"`),
// each feature file a stories module of its own, on the stories file next to it (a meta only, virtual:
// `../vitest.utils.ts`'s `virtualFeatureStories`), with the features' own support code: the root suite's `storybook`
// project, next to `node` and `browser` (the scenarios' Storybook projects, in `tmp/e2e/`, link this
// package's `node_modules`). The plugin comes from its addon in `.storybook/main.ts` (with its
// options), whose preset gives this project its plugins. Storybook's builder reads its Vite options
// too.
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { defineConfig } from "vite";
import { nodeSourceCoverage, sourceDir } from "../vitest.utils.ts";

const repo = path.join(import.meta.dirname, "..");

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    react(),
    storybookTest({
      configDir: path.join(import.meta.dirname, ".storybook"),
    }),
    // The repo's coverage of the plugin's modules, as its suite measures them (Vitest only).
    ...(process.env.VITEST ? [nodeSourceCoverage(sourceDir)] : []),
  ],
  // The plugin's source is the repo's (outside this project), and the root features.
  server: { fs: { allow: [repo] } },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    name: "storybook",
    // Storybook's addon disables file writing for its project unless set (Vitest allows it on
    // localhost): without it, Vitest drops every annotation's attachment (`this.attach`'s data,
    // its content type), keeping its message. Allowed, as node and browser mode have them.
    api: { allowWrite: true },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      screenshotFailures: false,
    },
  },
});
