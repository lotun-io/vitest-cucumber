// Browser mode: cucumber runs in the page (`../worker/browser/`), from feature modules that carry
// their pickles. On top of the shared plugin, this registers the browser command the page asks main
// through (`../types/commands.ts`: locations, messages) and swaps the page's `@cucumber/cucumber` for
// the plugin's stand-in. `createBrowserPlugin` gives the hooks with what they're built on, for a
// plugin that extends browser mode (`./storybookPlugin.ts`).
import type { Plugin, ViteUserConfig as UserConfig } from "vitest/config";
import type { CucumberOptions } from "../types/feature.ts";
import type {} from "../types/providedContext.ts";
import {
  pageDependencies,
  pageExcluded,
  resolvePageCucumber,
} from "./browser/pageModules.ts";
import { createPlugin } from "./plugin/createPlugin.ts";
import { type Environment, inStorybook } from "./storybook/vitest/addon.ts";
import { ownModule } from "./utils/ownModule.ts";

/** Browser mode's hooks, and the shared plugin (`core`) they're built on. */
export const createBrowserPlugin = (options: CucumberOptions | undefined) => {
  const core = createPlugin(options, {
    platform: ownModule("worker/browser/platform"),
  });
  const hooks = {
    config: (userConfig: UserConfig): UserConfig => {
      const config = core.config(userConfig);
      return {
        ...config,
        test: {
          ...config.test,
          browser: { commands: core.commands.browser },
        },
        // Our page-side dependencies, pre-bundled at startup: Vite's scanner can't see them behind
        // `.feature` files, and a dependency found mid-run makes Vite reload the page.
        optimizeDeps: {
          // The page's support code, runner and summary (`../worker/browser/`, `../worker/platform/summary/`).
          include: pageDependencies,
          exclude: pageExcluded,
        },
      };
    },
    configResolved: core.configResolved,
    configureVitest: core.configureVitest,
    resolveId: resolvePageCucumber,
    // A Storybook project's feature file is its stories module, the Storybook plugin's to write
    // (`./storybookPlugin.ts`): no test module made here to be replaced.
    transform(this: { environment: Environment }, code: string, id: string) {
      return inStorybook(this.environment)
        ? undefined
        : core.transform(code, id);
    },
  };
  return { core, hooks };
};

/** Browser mode's plugin, of `createBrowserPlugin`'s hooks. */
export const browserCucumber = ({
  hooks,
}: ReturnType<typeof createBrowserPlugin>): Plugin => ({
  name: "vitest-cucumber:browser",
  apply: (userConfig) => Boolean(userConfig.test?.browser?.enabled),
  // Before Vite's resolver, so `resolveId` wins.
  enforce: "pre",
  ...hooks,
});
