import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadSupport } from "@cucumber/cucumber/api";
import path from "node:path";
import { test } from "vitest";
import type { WithHook } from "../utils/config.ts";
import {
  prepareRunConfiguration,
  resolveRunConfiguration,
} from "../utils/config.ts";
import { globalRef } from "../utils/globals.ts";
import { isPublishEnabled, writeEnvelopes } from "../utils/publish.ts";
import {
  registerFeatureTests,
  registerWorkerCleanup,
} from "../utils/registerFeatureTests.ts";
import type { ResultItem } from "../utils/runCucumber.ts";
import { runCucumber } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";

export type ModuleLoader = (specifier: string) => Promise<unknown>;

const ext = path.extname(import.meta.filename);
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
  mergedConfig: IConfiguration;
} | null = null;

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

  const { runConfiguration, mergedConfig } = await resolveRunConfiguration({
    config,
    loadSupportPath,
  });

  // Load support via the Vitest module loader so step-file imports go through
  // Vitest's resolution pipeline.
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

  cached = { runConfiguration, support, testStepErrors, mergedConfig };

  return { isCached: false };
};

type RunOptions = {
  id: string;
  withHook: WithHook;
  provided?: Partial<Pick<IRunConfiguration["runtime"], "dryRun" | "retry">>;
  testLocations?: number[];
  onTestCaseFinished?: (result: ResultItem) => void;
};

const run = async ({
  id,
  withHook,
  testLocations,
  provided,
  onTestCaseFinished,
}: RunOptions) => {
  if (!cached) {
    throw new Error("ensureCache was not called");
  }

  const publish = !provided?.dryRun && isPublishEnabled();

  return runCucumber({
    id,
    runConfiguration: prepareRunConfiguration({
      id,
      runConfiguration: cached.runConfiguration,
      support: cached.support,
      withHook,
      testLocations,
      provided,
    }),
    testStepErrors: cached.testStepErrors,
    publish,
    onTestCaseFinished,
  });
};

registerWorkerCleanup({
  onCleanup: async () => {
    const { envelopes, startedAt } = await run({
      id: lifecycleFeaturePath,
      withHook: "after",
    });
    await writeEnvelopes({
      envelopes,
      startedAt,
      projectName: worker?.ctx?.projectName,
    });
  },
});

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
    provided: { dryRun: true },
  });

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

  const withHook = isCached ? "none" : "before";

  const runPromise = run({
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

  runPromise.catch(() => null);

  test.afterAll(async () => {
    // Collect the real run's envelopes for --publish.
    const { envelopes, startedAt } = await runPromise;
    const projectName = worker?.ctx?.projectName;
    await writeEnvelopes({ envelopes, startedAt, projectName });
  });
};
