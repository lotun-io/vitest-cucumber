// The plugin's entry point for node and browser projects: Vite plugins, node mode's and browser
// mode's, each applying only to its own kind of project (`test.browser.enabled`). Storybook projects
// get theirs from the plugin's Storybook addon (`./core/storybook/preset.ts`), never from here.
import type { Plugin } from "vitest/config";
import { createBrowserPlugin } from "./core/browserPlugin.ts";
import { createNodePlugin } from "./core/nodePlugin.ts";
import type { CucumberOptions } from "./types/feature.ts";

export type { CucumberOptions };

/**
 * The plugin for node and browser projects (by the project's `test.browser.enabled`), with its
 * options (`import` required; the others cucumber's defaults). A Storybook project gets it from
 * its addon instead:
 * `cucumber({ … })` from `@lotun/vitest-cucumber/storybook/node` in `.storybook/main.ts`.
 */
export const cucumber = (options: CucumberOptions): Plugin[] => [
  createNodePlugin(options),
  createBrowserPlugin(options),
];
