import { beforeAll, afterAll } from "vitest";
import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import path from "node:path";
import { parseFeature } from "./parser.ts";
import { cliConfig } from "./config.ts";
import type { ResultItem } from "./runCucumber.ts";
import { runCucumber, registerFeatureTests } from "./runCucumber.ts";

export type ModuleLoader = (specifier: string) => Promise<unknown>;

let cache: {
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary & { defaultTimeout?: number };
  testStepErrors: Map<string, Error>;
} | null = null;

export const runFeatureFile = async ({
  id,
  code,
  config,
  moduleLoader,
}: {
  id: string;
  code: string;
  config: Partial<IConfiguration>;
  moduleLoader: ModuleLoader;
}): Promise<void> => {
  const parsed = await parseFeature(code, id);
  const results = new Map<string, ResultItem>(
    parsed.pickles.map((pickle) => [
      pickle.key,
      { resolvers: Promise.withResolvers() },
    ]),
  );

  let runCucumberError: Error | null = null;

  if (process.env.VITEST_WORKER_ID !== undefined) {
    process.env.CUCUMBER_WORKER_ID = process.env.VITEST_WORKER_ID;
  }

  beforeAll(async () => {
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
            path.join(
              import.meta.dirname,
              `silentFormatter${path.extname(import.meta.filename)}`,
            ),
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
    }

    cache.testStepErrors.clear();

    runCucumber({
      ...cache,
      id,
      results,
    })
      .catch((err) => {
        runCucumberError = err;
      })
      .finally(() => {
        results.forEach((result) => {
          result.resolvers.resolve(null);
        });
      });
  }, 0);

  afterAll(async () => {
    if (runCucumberError) {
      throw runCucumberError;
    }
  });

  registerFeatureTests({
    featureName: parsed.featureName,
    pickles: parsed.pickles,
    id,
    results,
  });
};
