import type { IConfiguration } from "@cucumber/cucumber";
import type { ModuleLoader } from "../utils/runner.ts";

export interface VitestCucumberGlobal {
  moduleLoader: ModuleLoader;
  config: Partial<IConfiguration>;
}

declare global {
  var __vitestCucumber: VitestCucumberGlobal | undefined;
}
