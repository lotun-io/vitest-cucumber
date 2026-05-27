import type { IConfiguration } from "@cucumber/cucumber";
import { createRequire } from "module";
import { parseArgsStringToArgv } from "string-argv";

const require = createRequire(import.meta.url);
const { ArgvParser } = require("@cucumber/cucumber/lib/configuration/index");

export const cliConfig = (stringArgs?: string): Partial<IConfiguration> => {
  if (!stringArgs) {
    return {};
  }
  const { configuration } = ArgvParser.parse([
    "node",
    "cucumber-js",
    ...parseArgsStringToArgv(stringArgs),
  ]);
  return configuration;
};
