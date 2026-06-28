import type { IConfiguration } from "@cucumber/cucumber";
import type {
  IRunConfiguration,
  ISupportCodeCoordinates,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { createRequire } from "node:module";
import { parseArgsStringToArgv } from "string-argv";

const require = createRequire(import.meta.url);
const { ArgvParser } = require("@cucumber/cucumber/lib/configuration/index");

// Parses a CUCUMBER_OPTIONS string (Cucumber CLI syntax) into a partial
// configuration via Cucumber's own ArgvParser.
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

// Resolves the effective Cucumber configuration shared by the node and browser
// runners: the plugin config is the base, CLI options (CUCUMBER_OPTIONS) override
// it, an `order: "random"` is pinned to a concrete seed (so a dry-run plan and
// the real run agree on scenario order), and `parallel` is forbidden — Vitest
// owns parallelism.
export const mergeConfig = (
  config: Partial<IConfiguration>,
): Partial<IConfiguration> => {
  const merged = { ...config, ...cliConfig(process.env.CUCUMBER_OPTIONS) };

  if (merged.order === "random") {
    merged.order = `random:${Math.floor(Math.random() * 999999).toString()}`;
  }

  if (merged.parallel !== undefined) {
    throw new Error(
      "Parallel execution is not supported use vitest parallelism instead.",
    );
  }

  return merged;
};

export type WithHook = "before" | "after" | "none";

type TestRunHookDefinitions = {
  beforeTestRunHookDefinitions: readonly unknown[];
  afterTestRunHookDefinitions: readonly unknown[];
};

// Clones the support library keeping only the requested test-run hooks, so
// BeforeAll/AfterAll don't fire on every per-feature `runCucumber` call.
const prepareSupport = ({
  support,
  withHook,
}: {
  support: ISupportCodeLibrary;
  withHook: WithHook;
}): Partial<ISupportCodeCoordinates> => {
  const lib = support as ISupportCodeLibrary & TestRunHookDefinitions;
  return {
    ...lib,
    beforeTestRunHookDefinitions:
      withHook === "before" ? lib.beforeTestRunHookDefinitions : [],
    afterTestRunHookDefinitions:
      withHook === "after" ? lib.afterTestRunHookDefinitions : [],
  } as Partial<ISupportCodeCoordinates>;
};

export type PrepareRunConfigurationOptions = {
  id: string;
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  withHook: WithHook;
  testLocations?: number[];
  runtime?: Partial<Pick<IRunConfiguration["runtime"], "dryRun" | "retry">>;
};

export const prepareRunConfiguration = ({
  id,
  runConfiguration,
  support,
  withHook,
  testLocations,
  runtime,
}: PrepareRunConfigurationOptions): IRunConfiguration => {
  return {
    ...runConfiguration,
    runtime: {
      ...runConfiguration.runtime,
      ...runtime,
    },
    sources: {
      ...runConfiguration.sources,
      paths: [testLocations?.length ? `${id}:${testLocations.join(":")}` : id],
    },
    support: prepareSupport({ support, withHook }),
  };
};
