// A feature file's runtime for its stories module (`./featureStories.ts`, which imports it): a module
// whose default export plays its scenarios (`../../../worker/storybook/feature.ts`), from its Gherkin
// document and pickles. Shared by the Vitest plugin (`../../storybookPlugin.ts`) and Storybook's preview
// (`../preset.ts`). In story tests (the Vitest plugin's), it also hands the addon's story tests to the
// plugin's runtime (`../../../worker/storybook/vitest/tests.ts`): the addon's generated code imports
// `test` from "vitest" and `testStory` and `convertToFilePath` from its test utilities; the stories
// module's import of the test utilities resolves to its feature module (`storyTestsModuleId`), which
// exports `cucumberTests`'s, its Vitest import is the feature module's `vitest` (Vitest's exports, but
// for `test`: `../vitest/vitestImport.ts`), and its `storyTests` gives the stories module the calls its
// tests are declared with (`./featureStoriesModule.ts`).
import type { LoadRun } from "../../../types/platform.ts";
import type { FeatureModel } from "../../../types/storybook.ts";
import { isFeatureFile } from "../../feature/featureFile.ts";
import type { FailedPlan } from "../../feature/plans.ts";
import { throwCode } from "../../utils/errorCode.ts";
import { ownModule } from "../../utils/ownModule.ts";
import { withoutQuery } from "../../utils/withoutQuery.ts";
import type { StorybookPlan } from "./storybookPlans.ts";

/**
 * A feature module's id: its feature file's path, with a query. Vite takes a module's file from its
 * id without the query, so the module is the feature file's: Vitest prints a failing step's code
 * frame at its Gherkin line, as for a feature file (its error's first frame, in a file it
 * transformed). An id ending in `.feature` would be taken for a feature file (browser mode's
 * transform): the query keeps it from that.
 */
const featureModuleQuery = "?vitest-cucumber-storybook";

/** The addon's module of `testStory` and `convertToFilePath`. */
export const testUtils = "@storybook/addon-vitest/internal/test-utils";

/** The id of `feature`'s feature module. */
export const featureModuleOf = (feature: string) =>
  `${feature}${featureModuleQuery}`;

/**
 * The id of the module for `source` imported by `importer`: the addon's test utilities imported by a
 * feature file's stories module, its feature module; else none.
 */
export const storyTestsModuleId = (
  source: string,
  importer: string | undefined,
) =>
  // The stories module's id is the feature file's own (the feature module's has its query, and
  // imports the addon's real test utilities).
  source === testUtils && importer && isFeatureFile(importer)
    ? featureModuleOf(importer)
    : undefined;

/** The feature file of a feature module's `id`, if it is one. */
export const featureFileOf = (id: string) =>
  id.endsWith(featureModuleQuery) ? withoutQuery(id) : undefined;

/**
 * The code of a feature module in story tests (storybook mode), from its feature's plan (the same
 * plan as its stories module's, `./storybookPlan.ts`: one reading of the file for both), one of two
 * blocks. A feature that can't be used: its error thrown (its stories module imports no feature
 * module: only one asked for with nothing made gets here). Else its exports the runtime's
 * (`storyTestsModule`, `../../../worker/storybook/vitest/tests.ts`: what its stories module's test
 * code imports), given the addon's test utilities (imported here: they resolve from the project,
 * not from the plugin) and the run (the project's root `cwd`, its options). Neither the feature's
 * tree nor the support files' import is here: the test file's own module has them, as calls and
 * as what it gives `storyTests` (`./featureStoriesModule.ts`).
 */
export const featureModule = ({
  cwd,
  plan,
}: {
  cwd: string;
  plan: StorybookPlan | FailedPlan;
}) => {
  if ("error" in plan) {
    return throwCode(plan.error);
  }
  const { uri, gherkin, options } = plan;
  const model: FeatureModel = { uri, gherkin };
  const run: LoadRun = { cwd, options };
  return [
    `import { createFeature } from ${JSON.stringify(ownModule("worker/storybook/feature"))};`,
    "import {",
    "  testStory as addonTestStory,",
    "  convertToFilePath as addonConvertToFilePath,",
    `} from ${JSON.stringify(testUtils)};`,
    `import { storyTestsModule } from ${JSON.stringify(ownModule("worker/storybook/vitest/tests"))};`,
    "export const { testStory, storyTests, convertToFilePath, vitest } = storyTestsModule({",
    "  testStory: addonTestStory,",
    "  convertToFilePath: addonConvertToFilePath,",
    `  run: ${JSON.stringify(run)},`,
    "});",
    `export default createFeature(${JSON.stringify(model)});`,
  ].join("\n");
};

/**
 * The code of a feature module in Storybook's preview, from its feature's plan, one of two blocks:
 * a feature that can't be used, its error thrown; else its default export plays its scenarios.
 */
export const featureModulePreview = (plan: StorybookPlan | FailedPlan) => {
  if ("error" in plan) {
    return throwCode(plan.error);
  }
  const model: FeatureModel = { uri: plan.uri, gherkin: plan.gherkin };
  return [
    `import { createFeature } from ${JSON.stringify(ownModule("worker/storybook/feature"))};`,
    `export default createFeature(${JSON.stringify(model)});`,
  ].join("\n");
};
