import type { IConfiguration } from "@cucumber/cucumber";
import type { ModuleLoader } from "../utils/runner.ts";

export interface VitestCucumberGlobal {
  moduleLoader: ModuleLoader;
  config: Partial<IConfiguration>;
  testStepErrors: Map<string, Error>;
}

declare global {
  var __vitestCucumber: VitestCucumberGlobal | undefined;
}
