import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll } from "vitest";
import { cliConfig } from "./config.ts";
import { registerFeatureTests } from "./registerFeatureTests.ts";
import { runCucumber } from "./runCucumber.ts";

export type ModuleLoader = (specifier: string) => Promise<unknown>;

let cache: {
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  testStepErrors: Map<string, Error>;
} | null = null;

// Vitest's per-worker teardown hook.
// We use this to run the AfterAll hook once per worker.
const onWorkerCleanup = (cleanup: () => unknown): void => {
  const worker = (
    globalThis as unknown as {
      __vitest_worker__?: { onCleanup?: (cb: () => unknown) => void };
    }
  ).__vitest_worker__;
  worker?.onCleanup?.(cleanup);
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
  // @ts-expect-error - vitest private api
  const vitestFiles = globalThis.__vitest_worker__?.ctx?.files as
    | { filepath?: string; testLocations?: number[] | undefined }[]
    | undefined;
  const currentVitestFile = vitestFiles?.find((file) => file?.filepath === id);
  const testLocations = currentVitestFile?.testLocations;

  const testCasesReady = Promise.withResolvers();

  // Subsequent features reuse the cache and strip BeforeAll so it fires once.
  const isCacheReused = Boolean(cache);

  if (process.env.VITEST_WORKER_ID !== undefined) {
    process.env.CUCUMBER_WORKER_ID = process.env.VITEST_WORKER_ID;
  }

  if (!cache) {
    const mergedConfig = {
      ...config,
      ...cliConfig(process.env.CUCUMBER_OPTIONS),
    };

    // We handle parallelization at the Vitest level
    if (mergedConfig.parallel !== undefined) {
      throw new Error("Parallel execution is not supported");
    }

    const { runConfiguration } = await loadConfiguration({
      provided: {
        format: [
          `"${pathToFileURL(
            path.join(
              import.meta.dirname,
              `silentFormatter${path.extname(import.meta.filename)}`,
            ),
          ).toString()}"`,
        ],
        ...mergedConfig,
        paths: [],
        import: [
          path.join(
            import.meta.dirname,
            `loadSupport${path.extname(import.meta.filename)}`,
          ),
        ],
        require: [],
      },
    });

    // We load support code using the Vitest module loader so that imports
    // inside step definitions go through Vitest's module resolution pipeline.
    const testStepErrors = new Map<string, Error>();
    global.__vitestCucumber = {
      moduleLoader,
      config: mergedConfig,
      testStepErrors,
    };
    const support = await loadSupport(runConfiguration).finally(() => {
      delete global.__vitestCucumber;
    });

    cache = { runConfiguration, support, testStepErrors };

    // Register AfterAll to run once when this worker is torn down
    onWorkerCleanup(async () => {
      await runCucumber({
        id: path.join(
          import.meta.dirname,
          "..",
          "features",
          "lifecycle.feature",
        ),
        runConfiguration,
        support,
        withHook: "after",
        testStepErrors,
      });
    });
  }

  cache.testStepErrors.clear();

  const runCucumberPromise = runCucumber({
    runConfiguration: cache.runConfiguration,
    support: cache.support,
    withHook: isCacheReused ? "none" : "before",
    testStepErrors: cache.testStepErrors,
    id,
    testLocations,
    onTestCasesReady: (params) => {
      registerFeatureTests(params);
      testCasesReady.resolve(null);
    },
  });

  void runCucumberPromise.catch(() => null);

  afterAll(async () => {
    await runCucumberPromise;
  });

  await testCasesReady.promise;
};
