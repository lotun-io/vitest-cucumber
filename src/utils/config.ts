import type { IConfiguration } from "@cucumber/cucumber";
import type {
  IRunConfiguration,
  ISupportCodeCoordinates,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration } from "@cucumber/cucumber/api";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgsStringToArgv } from "string-argv";

export const DEFAULT_IMPORT_GLOB = "features/**/*.{js,ts,cjs,cts,mjs,mts}";

const require = createRequire(import.meta.url);
const { ArgvParser } = require("@cucumber/cucumber/lib/configuration/index");

// config.ts lives in utils/, resolved with the running file's extension so it
// works in both src/ (dev) and dist/ (published).
const silentFormatterPath = path.join(
  import.meta.dirname,
  `silentFormatter${path.extname(import.meta.filename)}`,
);

export type CliArgs = {
  // Ad-hoc configuration (the regular flags: --tags, --retry, …).
  configuration: Partial<IConfiguration>;
  // Named profiles to source from the config file (--profile, repeatable).
  profiles?: string[];
  // Explicit config file path (--config); undefined → Cucumber auto-locates one.
  file?: string;
};

// Parses CUCUMBER_OPTIONS (Cucumber CLI syntax) via Cucumber's own ArgvParser.
// `profile`/`config` go to the loader bucket; everything else is ad-hoc `configuration`.
export const cliArgs = (stringArgs?: string): CliArgs => {
  if (!stringArgs) {
    return { configuration: {} };
  }
  const { configuration, options } = ArgvParser.parse([
    "node",
    "cucumber-js",
    ...parseArgsStringToArgv(stringArgs),
  ]);
  return {
    configuration,
    profiles: options.profile?.length ? options.profile : undefined,
    file: options.config,
  };
};

export const mergeConfig = async (
  config: Partial<IConfiguration>,
): Promise<IConfiguration> => {
  const { configuration, profiles, file } = cliArgs(
    process.env.CUCUMBER_OPTIONS,
  );

  const { useConfiguration } = await loadConfiguration({
    file,
    profiles,
    provided: { ...config, ...configuration, paths: [] },
  });

  return useConfiguration;
};

export const resolveRunConfiguration = async ({
  config,
  loadSupportPath,
}: {
  config: Partial<IConfiguration>;
  loadSupportPath: string;
}): Promise<{
  runConfiguration: IRunConfiguration;
  mergedConfig: IConfiguration;
}> => {
  const mergedConfig = await mergeConfig(config);

  if (mergedConfig.parallel) {
    throw new Error(
      "Parallel execution is not supported use vitest parallelism instead.",
    );
  }

  const { runConfiguration } = await loadConfiguration({
    file: false,
    provided: {
      ...mergedConfig,
      order:
        mergedConfig.order === "random"
          ? `random:${Math.floor(Math.random() * 999999).toString()}`
          : mergedConfig.order,
      publish: false,
      paths: [],
      format: mergedConfig.format?.length
        ? mergedConfig.format
        : [`"${pathToFileURL(silentFormatterPath).toString()}"`],
      import: [loadSupportPath],
      require: [],
    },
  });

  return { runConfiguration, mergedConfig };
};

export const resolveSupportGlobs = async (
  config: Partial<IConfiguration>,
): Promise<string[]> => {
  const mergedConfig = await mergeConfig(config);
  const supportGlobs = [
    ...(mergedConfig.import ?? []),
    ...(mergedConfig.require ?? []),
  ];

  const globs = supportGlobs.length ? supportGlobs : [DEFAULT_IMPORT_GLOB];
  return process.platform === "win32"
    ? globs.map((p) => p.replaceAll("\\", "/"))
    : globs;
};

export type WithHook = "before" | "after" | "none";

type TestRunHookDefinitions = {
  beforeTestRunHookDefinitions: readonly unknown[];
  afterTestRunHookDefinitions: readonly unknown[];
};

// Shallow-clones the support library keeping only the requested test-run hooks.
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
  provided?: Pick<
    Partial<IConfiguration>,
    "name" | "dryRun" | "retry" | "worldParameters"
  >;
};

export const prepareRunConfiguration = ({
  id,
  runConfiguration,
  support,
  withHook,
  testLocations,
  provided,
}: PrepareRunConfigurationOptions): IRunConfiguration => {
  return {
    ...runConfiguration,
    runtime: {
      ...runConfiguration.runtime,
      ...(provided?.dryRun !== undefined && { dryRun: provided.dryRun }),
      ...(provided?.retry !== undefined && { retry: provided.retry }),
      worldParameters: {
        ...runConfiguration.runtime.worldParameters,
        ...provided?.worldParameters,
      },
    },
    sources: {
      ...runConfiguration.sources,
      paths: [testLocations?.length ? `${id}:${testLocations.join(":")}` : id],
      ...(provided?.name?.length && { names: provided.name }),
    },
    support: prepareSupport({ support, withHook }),
  };
};
