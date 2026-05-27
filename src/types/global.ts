import type { IConfiguration } from "@cucumber/cucumber";
import type { ModuleLoader } from "../utils/runner.ts";

export interface VitestCucumberGlobal {
  moduleLoader: ModuleLoader;
  config: Partial<IConfiguration>;
}

declare global {
  // eslint-disable-next-line no-var -- only way to augment globalThis in TS
  var __vitestCucumber: VitestCucumberGlobal | undefined;
}
