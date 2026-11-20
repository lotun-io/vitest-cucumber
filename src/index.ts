// The plugin's entry point: Vite plugins. Node mode's and browser mode's each apply only to
// their own kind of project; Storybook's only to a project with Storybook's addon (`storybookTest()`),
// on top of browser mode's, which it shares.
import type { Plugin } from "vitest/config";
import { browserCucumber, createBrowserPlugin } from "./core/browserPlugin.ts";
import { nodeCucumber } from "./core/nodePlugin.ts";
import { storybookCucumber } from "./core/storybookPlugin.ts";
import type { CucumberOptions } from "./types/feature.ts";

export type { CucumberOptions };

/**
 * The plugin, with `options`; none given, the project's options file's (`cucumber.config.ts` in its
 * root; a Storybook project's, `<configDir>/cucumber.config.ts`, which takes no options here).
 */
export const cucumber = (options?: CucumberOptions): Plugin[] => {
  const browser = createBrowserPlugin(options);
  // Browser mode's plugin before Storybook's: in a Storybook project, Storybook's `transform` (also
  // `pre`) replaces browser mode's feature test module with the stories' run.
  return [
    nodeCucumber(options),
    browserCucumber(browser),
    ...storybookCucumber(browser),
  ];
};
