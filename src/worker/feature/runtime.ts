// A feature file's runtime, running in the Vitest worker or the page (the feature module calls
// `feature()`, then the calls it gives back; a file that doesn't parse has no feature to run, its
// module throws its error: `../../core/feature/featureModule.ts`). It gives the mode's `Platform`
// its support code to load (loaded as the worker's or page's first file runs: `./workerFixture.ts`;
// not as it's collected), and gives the module its suites' `describe` and its scenarios'
// `scenarioTest` (Vitest locates each at its Gherkin line: the call's, through the module's map,
// with the plugin's `includeTaskLocation`): a test runs its pickle and shows the outcome (its
// attachments as annotations, its skip, its error). The BeforeAll and AfterAll runs belong to the
// worker fixture (see `./workerFixture.ts`). Page-safe.
import { describe } from "vitest";
import type { Feature, ImportSupport } from "../../types/feature.ts";
import type { Platform } from "../../types/platform.ts";
import { scenarioAt } from "../platform/scenario/scenarioAt.ts";
import { runScenarioTest } from "../platform/scenario/scenarioTest.ts";
import { scenarioTestOptions } from "../platform/scenario/scenarioTestOptions.ts";
import { featureTest, useWorkerFixture } from "./workerFixture.ts";

export const feature = ({
  plan,
  platform,
  importSupport,
}: {
  /** The feature file, from main's plan of it (its tests are the module's calls). */
  plan: Omit<Feature, "featureTree">;
  /** The mode's platform. */
  platform: Platform;
  /** Imports the support files. */
  importSupport: ImportSupport;
}) => {
  const { cwd, uri, options, gherkin } = plan;
  platform.use({ cwd, options }, importSupport);
  useWorkerFixture(platform);
  return {
    /** A suite of the feature's (the feature, a rule, an outline). */
    describe: (name: string, body: () => void) => {
      describe(name, body);
    },
    /** A scenario's or an example's test, with its Gherkin tags: the scenario at its Gherkin `line`. */
    scenarioTest: (
      name: string,
      { tags }: { tags: string[] },
      line: number,
    ) => {
      // Destructured: Vitest reads a fixture test's first parameter for the fixtures it uses.
      featureTest(
        name,
        scenarioTestOptions(tags),
        async ({ annotate, skip, task }) => {
          await runScenarioTest(
            platform,
            scenarioAt({ uri, gherkin }, line),
            task,
            { annotate, skip },
          );
        },
      );
    },
  };
};
