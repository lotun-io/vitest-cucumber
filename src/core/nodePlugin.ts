// Node mode: the plugin's cucumber runtime runs each scenario inside the Vitest worker
// (`../worker/node/platform.ts`). On top of the shared plugin, this provides what the workers need
// from main.
import type { Plugin } from "vitest/config";
import type { CucumberOptions } from "../types/feature.ts";
import type {} from "../types/providedContext.ts";
import { createPlugin } from "./plugin/createPlugin.ts";
import { ownModule } from "./utils/ownModule.ts";

/** Node mode's plugin (`cucumber()`'s, in a node project: `test.browser.enabled` unset). */
export const createNodePlugin = (
  options: CucumberOptions | undefined,
): Plugin => {
  const core = createPlugin(options, {
    platform: ownModule("worker/node/platform"),
    commandServer: true,
  });
  return {
    name: "vitest-cucumber:node",
    apply: (userConfig) => !userConfig.test?.browser?.enabled,
    config: core.config,
    configResolved: core.configResolved,
    configureVitest: core.configureVitest,
    transform: core.transform,
  };
};
