import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll } from "vitest";
import type { WithHook } from "../utils/config.ts";
import { mergeConfig, prepareRunConfiguration } from "../utils/config.ts";
import { globalRef } from "../utils/globals.ts";
import { registerFeatureTests } from "../utils/registerFeatureTests.ts";
import type { ResultItem } from "../utils/runCucumber.ts";
import { runCucumber } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";

export type ModuleLoader = (specifier: string) => Promise<unknown>;

const ext = path.extname(import.meta.filename);
const silentFormatterPath = path.join(
  import.meta.dirname,
  "..",
  "utils",
  `silentFormatter${ext}`,
);
const loadSupportPath = path.join(import.meta.dirname, `loadSupport${ext}`);
const lifecycleFeaturePath = path.join(
  import.meta.dirname,
  "..",
  "features",
  "lifecycle.feature",
);
const worker = globalRef.__vitest_worker__;

let cached: {
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  testStepErrors: Map<string, SerializedError>;
} | null = null;

type RunOptions = {
  id: string;
  withHook: WithHook;
  runtime?: Partial<Pick<IRunConfiguration["runtime"], "dryRun" | "retry">>;
  testLocations?: number[];
  onTestCaseFinished?: (result: ResultItem) => void;
};

const ensureCache = async ({
  config,
  moduleLoader,
}: {
  config: Partial<IConfiguration>;
  moduleLoader: ModuleLoader;
}) => {
  if (cached) {
    return { isCached: true };
  }

  const mergedConfig = mergeConfig(config);

  const { runConfiguration } = await loadConfiguration({
    provided: {
      format: [`"${pathToFileURL(path.join(silentFormatterPath)).toString()}"`],
      ...mergedConfig,
      paths: [],
      import: [loadSupportPath],
      require: [],
    },
  });

  // We load support code using the Vitest module loader so that imports
  // inside step definitions go through Vitest's module resolution pipeline.
  const testStepErrors = new Map<string, SerializedError>();
  globalRef.__vitest_cucumber_node__ ??= {};
  globalRef.__vitest_cucumber_node__.support = {
    moduleLoader,
    config: mergedConfig,
    testStepErrors,
  };
  const support = await loadSupport(runConfiguration).finally(() => {
    delete globalRef.__vitest_cucumber_node__;
  });

  cached = { runConfiguration, support, testStepErrors };

  return { isCached: false };
};

const run = async ({
  id,
  withHook,
  testLocations,
  runtime,
  onTestCaseFinished,
}: RunOptions) => {
  if (!cached) {
    throw new Error("ensureCache was not called");
  }

  return runCucumber({
    id,
    runConfiguration: prepareRunConfiguration({
      id,
      runConfiguration: cached.runConfiguration,
      support: cached.support,
      withHook,
      testLocations,
      runtime,
    }),
    testStepErrors: cached.testStepErrors,
    onTestCaseFinished,
  });
};

export const runFeatureFile = async ({
  id,
  config,
  moduleLoader,
}: {
  id: string;
  config: Partial<IConfiguration>;
  moduleLoader: ModuleLoader;
}): Promise<void> => {
  const testLocations = worker?.ctx?.files?.find(
    (file) => file?.filepath === id,
  )?.testLocations;

  if (process.env.VITEST_WORKER_ID !== undefined) {
    process.env.CUCUMBER_WORKER_ID = process.env.VITEST_WORKER_ID;
  }

  const { isCached } = await ensureCache({
    config,
    moduleLoader,
  });

  const { featureName, results: dryRunResults } = await run({
    id,
    withHook: "none",
    testLocations,
    runtime: { dryRun: true },
  });

  if (!isCached) {
    // Register AfterAll to run once when this worker is torn down
    worker?.onCleanup?.(async () => {
      await run({
        id: lifecycleFeaturePath,
        withHook: "after",
      });
    });
  }

  const results = new Map<string, ResultItem>(
    dryRunResults.values().map((result) => [
      result.id,
      {
        ...result,
        status: undefined,
        resolvers: Promise.withResolvers(),
      },
    ]),
  );

  registerFeatureTests({
    id,
    featureName,
    results,
  });

  // First feature of the worker keeps BeforeAll; later ones skip it.
  const withHook = isCached ? "none" : "before";

  const runCucumberPromise = run({
    id,
    withHook,
    testLocations,
    onTestCaseFinished: (finished) => {
      const result = results.get(finished.id ?? "");
      if (!result) {
        throw new Error(`Result not found for test case: ${finished.name}`);
      }
      Object.assign(result, finished);
      result.resolvers?.resolve(null);
    },
  }).finally(() => {
    for (const result of results.values()) {
      result.resolvers?.resolve(null);
    }
  });

  afterAll(async () => {
    await runCucumberPromise;
  });
};
