// Browser mode: cucumber runs in the page (`../worker/browser/`), from feature modules that carry
// their pickles. On top of the shared plugin, this registers the browser command the page asks main
// through (`../types/commands.ts`: locations, messages) and swaps the page's `@cucumber/cucumber` for
// the plugin's stand-in. `createBrowserHooks` gives the hooks with what they're built on, without
// the feature files' transform: a Storybook project's plugins use the hooks alone, its feature
// files being its stories modules (`./storybookPlugin.ts`); `createBrowserPlugin` is browser
// mode's plugin on them.
import type { Plugin, ViteUserConfig as UserConfig } from "vitest/config";
import type { CucumberOptions } from "../types/feature.ts";
import type {} from "../types/providedContext.ts";
import {
  pageDependencies,
  pageExcluded,
  resolvePageCucumber,
} from "./browser/pageModules.ts";
import { createPlugin } from "./plugin/createPlugin.ts";
import { checkNotInStorybookProject } from "./plugin/storybookProjectCheck.ts";
import { ownModule } from "./utils/ownModule.ts";

/**
 * Browser mode's hooks, and the shared plugin (`core`) they're built on; `options` as given (a
 * Storybook addon entry's may have none: the shared plugin checks them).
 */
export const createBrowserHooks = (options: Partial<CucumberOptions>) => {
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
          // Vitest's file system module cache off for this project. A feature's module is the
          // plugin's to make, from more than the file's text (the support files, a Storybook
          // feature's stories), so it must not be kept there: the plugin opts its feature modules
          // out (`./plugin/createPlugin.ts`'s `defineCacheKeyGenerator`), which Vitest 5.1.1
          // doesn't apply to a browser instance (its bug: `CLAUDE.md`, "Updating Vitest"). A
          // browser project reads that cache only where Vitest transforms a test file itself
          // (`vitest list`, `--changed`), never for what its pages run. To drop once Vitest
          // applies the opt-out there.
          fsModuleCache: false,
        },
        // What the page imports, pre-bundled at startup: Vite's scanner reads the test files to find
        // the packages to pre-bundle and can't read a `.feature` file, and a package found only as
        // the page first imports it is pre-bundled then, Vite reloading the page mid-run.
        optimizeDeps: {
          // The page's support code, runner and summary (`../worker/browser/`, `../worker/platform/summary/`).
          include: pageDependencies,
          exclude: pageExcluded,
          // The project's own: its support files, for the scanner to follow (their globs, from
          // the root, as Vite reads its entries).
          entries: core.supportGlobs,
        },
      };
    },
    configResolved: core.configResolved,
    configureVitest: core.configureVitest,
    resolveId: resolvePageCucumber,
  };
  return { core, hooks };
};

/**
 * Browser mode's plugin (`cucumber()`'s, in a browser project): its hooks and its feature files'
 * transform; refused in a Storybook project, which gets its plugins from its addon.
 */
export const createBrowserPlugin = (options: CucumberOptions): Plugin => {
  const { core, hooks } = createBrowserHooks(options);
  return {
    name: "vitest-cucumber:browser",
    apply: (userConfig) => Boolean(userConfig.test?.browser?.enabled),
    // Before Vite's resolver, so `resolveId` wins.
    enforce: "pre",
    ...hooks,
    configResolved: (config) => {
      checkNotInStorybookProject(config.plugins);
      hooks.configResolved(config);
    },
    transform: core.transform,
  };
};
