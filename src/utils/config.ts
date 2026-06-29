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

const require = createRequire(import.meta.url);
const { ArgvParser } = require("@cucumber/cucumber/lib/configuration/index");

// config.ts lives in utils/, so the silent formatter is a sibling. Resolved with
// the running file's extension so it works in src/ (dev) and dist/ (published).
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

// Parses a CUCUMBER_OPTIONS string (Cucumber CLI syntax) via Cucumber's own
// ArgvParser. `profile`/`config` come out in ArgvParser's `options` bucket (they
// drive the configuration LOADER, not the configuration itself); everything else
// is the ad-hoc `configuration`.
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

// Resolves the effective Cucumber configuration shared by the node and browser
// runners. The plugin config is the base; CUCUMBER_OPTIONS override it and may
// select named `--profile`s / a `--config` file, which Cucumber's own loader
// merges UNDER the provided values (provided > profile > default). Our invariants
// are then imposed on the resolved flat config — so they catch profile-supplied
// values too: `order: "random"` is pinned to a concrete seed (so the dry-run plan
// and the real run agree on scenario order) and `parallel` is forbidden (Vitest
// owns parallelism). The returned flat config carries the profile-resolved
// `import`/`require` step globs: the node runner feeds them to its own module
// loader, and the browser plugin reads them (via `resolveSupportGlobs`) to bake
// the page's `import.meta.glob`.
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

  if (useConfiguration.parallel) {
    throw new Error(
      "Parallel execution is not supported use vitest parallelism instead.",
    );
  }

  if (useConfiguration.order === "random") {
    useConfiguration.order = `random:${Math.floor(Math.random() * 999999).toString()}`;
  }

  return useConfiguration;
};

// Produces the `IRunConfiguration` both runners feed to Cucumber. It re-resolves
// the profile-merged flat config with `file: false` (so our values are
// authoritative), pointing `import` at the caller's support-bridge loader. A
// user-provided `format` is PRESERVED — the silent formatter is only injected
// when none is configured, so Cucumber's CLI output stays quiet by default but a
// user formatter still works. Returns the resolved `mergedConfig` flat config too: the
// node runner feeds its `import`/`require` globs to its own module loader (the
// browser command ignores `mergedConfig` — its page globs come from the plugin).
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

  const { runConfiguration } = await loadConfiguration({
    file: false,
    provided: {
      ...mergedConfig,
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

// Resolves the effective (profile-aware) support-code globs, split by Cucumber's
// two keys. The browser plugin bakes these into the wrapper's literal
// `import.meta.glob`, so a profile's/config file's globs reach the page bundle too
// (not just the Node support build). `require` (CJS) globs are returned alongside
// `import` (ESM) for parity with node mode — the page loads everything as ESM via
// Vite (a genuinely Node-only `require` entry can't run in the browser regardless).
export const resolveSupportGlobs = async (
  config: Partial<IConfiguration>,
): Promise<{ import: string[]; require: string[] }> => {
  const mergedConfig = await mergeConfig(config);
  return {
    import: mergedConfig.import ?? [],
    require: mergedConfig.require ?? [],
  };
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
