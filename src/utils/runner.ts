import { beforeAll } from "vitest";
import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import path from "path";
import { parseFeature } from "./parser.ts";
import { cliConfig } from "./config.ts";
import type { Results } from "./runCucumber.ts";
import { runCucumber, registerFeatureTests } from "./runCucumber.ts";

export type ModuleLoader = (specifier: string) => Promise<unknown>;

let cache: {
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary & { defaultTimeout?: number };
} | null = null;

export function runFeatureFile({
  id,
  code,
  config,
  moduleLoader,
}: {
  id: string;
  code: string;
  config: Partial<IConfiguration>;
  moduleLoader: ModuleLoader;
}): void {
  const parsed = parseFeature(code, id);
  const mergedConfig = {
    ...config,
    ...cliConfig(process.env.CUCUMBER_OPTIONS),
  };
  const results: Results = new Map();

  process.env.CUCUMBER_WORKER_ID = process.env.VITEST_WORKER_ID;

  // We handle parallelization at the Vitest level
  delete mergedConfig.parallel;

  beforeAll(async () => {
    if (!cache) {
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
      global.__vitestCucumber = {
        moduleLoader,
        config: mergedConfig,
      };
      const support = await loadSupport(runConfiguration);
      delete global.__vitestCucumber;

      cache = { runConfiguration, support };
    }

    await runCucumber({
      id,
      runConfiguration: cache.runConfiguration,
      support: cache.support,
      results,
    });
  }, 0);

  registerFeatureTests({
    featureName: parsed.featureName,
    scenarios: parsed.scenarios,
    id,
    results,
  });
}
