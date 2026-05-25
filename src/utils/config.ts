import type { IConfiguration } from "@cucumber/cucumber";
import { parseArgsStringToArgv } from "string-argv";

// eslint-disable-next-line @typescript-eslint/no-require-imports
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
