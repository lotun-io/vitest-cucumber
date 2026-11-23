// A scenario's Vitest config, the default one: the plugin with the scenario's options, in a mode
// (node, or a browser's). A scenario may write its own instead (see `../steps/files.ts`).
import { inject } from "vitest";
import type {} from "./chromium.ts";
import { writeConfig, writeStorybookWrapper } from "./config.ts";
import { useStorybookProject } from "./storybookProject.ts";
import type { E2EWorld } from "./world.ts";

export const CONFIG = "vitest.config.ts";

/** The plugin in a config's code, with the scenario's options (JSON). */
const pluginsCode = (options: E2EWorld["pluginOptions"]) =>
  `cucumber(${JSON.stringify({ import: ["features/**/*.ts"], ...options })}),`;

/**
 * A run's mode: node, a browser's (`browser`: Chromium's, the default), or Storybook's story tests
 * (`storybook`: the feature files as stories, `./storybookProject.ts`). Storybook's preview isn't a
 * mode: its scenarios build it and read it (`../steps/storybook.ts`).
 */
const modes = ["node", "browser", "firefox", "webkit", "storybook"] as const;
export type Mode = (typeof modes)[number];

/**
 * The Playwright provider of a default config's `browser`: Chromium is the run's shared one
 * (`./chromium.ts`), connected to; Firefox and WebKit, launched by the scenario's Vitest.
 */
const providerCode = (browser: string) =>
  browser === "chromium"
    ? `playwright({ connectOptions: { wsEndpoint: ${JSON.stringify(inject("e2eChromium"))} } })`
    : "playwright()";

/**
 * A scenario's default Vitest config: the plugin with its options, in `mode`. Each default config is
 * a function (`defineConfig(() => …)`), its plugins made per Vitest: Node keeps a config module
 * loaded for good, and a plugin instance that keeps its Vitest (Storybook's addon does) would keep
 * every scenario's Vitest alive in the worker.
 */
export const defaultConfig = (
  options: E2EWorld["pluginOptions"],
  mode: Mode,
) => {
  const browser = mode === "firefox" || mode === "webkit" ? mode : "chromium";
  return `import { cucumber } from "@lotun/vitest-cucumber";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
  plugins: [
    ${pluginsCode(options)}
  ],
  test: {
    // One worker or page per run: a scenario's files run in turn (its own options may say otherwise).
    maxWorkers: 1,
    include: ["features/**/*.feature", "features/**/*.feature.md"],
    browser: {
      enabled: ${mode !== "node"},
      headless: true,
      provider: ${mode === "node" ? "playwright()" : providerCode(browser)},
      instances: [{ browser: "${browser}" }],
      screenshotFailures: false,
    },
  },
}));
`;
};

/**
 * The default config of a Storybook project (`storybook` mode): the addon's Vitest project, without
 * `cucumber()` (the plugin comes from its addon entry in `.storybook/main.ts`, with the scenario's
 * options: see `./storybookProject.ts`).
 */
export const defaultStorybookConfig =
  () => `import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
  plugins: [
    react(),
    storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") }),
  ],
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    // One page per run (as \`defaultConfig\`).
    maxWorkers: 1,
    // As the addon disables it: attachments' data, as node and browser mode have them.
    api: { allowWrite: true },
    browser: {
      enabled: true,
      headless: true,
      provider: ${providerCode("chromium")},
      instances: [{ browser: "chromium" }],
      screenshotFailures: false,
    },
  },
}));
`;

/**
 * The default config in `mode` (see `defaultConfig`); the scenario's own config, if it has one, in
 * `mode` (storybook: its projects with the plugin the addon's).
 */
export async function writeDefaultConfig(this: E2EWorld, mode: string) {
  if (!modes.includes(mode as Mode)) {
    throw new Error(
      `Unknown mode "${mode}": node, browser (Chromium), firefox, webkit or storybook`,
    );
  }
  this.mode = mode as Mode;
  // The scenario's own config, in its mode: as it is; in storybook mode, a Storybook project's (the
  // projects with the plugin the addon's: `asStorybook`).
  if (this.ownConfig) {
    if (this.mode === "storybook") {
      await useStorybookProject.call(this);
      await writeStorybookWrapper(this, CONFIG, providerCode("chromium"));
    }
    return;
  }
  if (this.mode === "storybook") {
    await useStorybookProject.call(this);
    await writeConfig(this, CONFIG, defaultStorybookConfig());
    return;
  }
  await writeConfig(this, CONFIG, defaultConfig(this.pluginOptions, this.mode));
}
