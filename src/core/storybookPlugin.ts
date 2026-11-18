// Storybook: `cucumber()`'s part for the Vitest project of Storybook's addon (`storybookTest()`), on
// top of browser mode (`./browserPlugin.ts`, whose `core` it shares). Its hooks act only in an
// environment of a project with the addon's plugin (`./storybook/vitest/addon.ts`'s `inStorybook`):
// there, a feature file (a test file: the project's `include` comes from
// Storybook's `stories`) is its stories module (`./storybook/stories/featureStories.ts`: its stories file's
// meta, a story per scenario), instead of browser mode's test module (whose `transform` leaves a
// Storybook project's feature files alone: `./browserPlugin.ts`), and its feature module is served
// (`./storybook/stories/featureRuntimeModule.ts`, which loads the support code with the project's root and the run's
// options); anywhere else, nothing. The story tests are the addon's, from the stories module (its
// transform runs after this one), handed to the plugin's runtime: the module's import of the addon's
// test utilities resolved to its feature module, its Vitest import the feature module's `vitest`, and
// the feature's tests declared after the addon's (`./storybook/vitest/vitestImport.ts`).
import type { Plugin } from "vitest/config";
import type { createBrowserPlugin } from "./browserPlugin.ts";
import { isFeatureFile } from "./feature/featureFile.ts";
import {
  featureFileOf,
  featureModule,
  featureModuleOf,
  storyTestsModuleId,
  testUtils,
} from "./storybook/stories/featureRuntimeModule.ts";
import { storiesModule } from "./storybook/stories/featureStoriesModule.ts";
import {
  createStorybookPlans,
  type StorybookPlans,
} from "./storybook/stories/storybookPlans.ts";
import { inStorybook } from "./storybook/vitest/addon.ts";
import { vitestFromFeature } from "./storybook/vitest/vitestImport.ts";
import { importSupportCode } from "./support/importSupportCode.ts";
import { withoutQuery } from "./utils/withoutQuery.ts";

export const storybookCucumber = ({
  core,
}: ReturnType<typeof createBrowserPlugin>): Plugin[] => {
  /**
   * The Storybook plans, on the plugin's feature plans: made as a Storybook project's hook first
   * needs them (in any other project, never), and told a watching Vitest's file changes from
   * then on, after the feature plans; the features they say are out of date are rerun.
   */
  const createPlans = () => {
    const made = createStorybookPlans({
      plans: core.featurePlans,
      root: core.root,
      configuration: core.configuration,
    });
    core.onFileChange(async (type, file) => {
      const { staleFeatures } = await made.onFileChange(type, file);
      staleFeatures.forEach(core.rerun);
    });
    return made;
  };
  let plans: StorybookPlans | undefined;
  const storybookPlans = () => (plans ??= createPlans());
  /** The plugin in a Storybook project's environments (none elsewhere). */
  const environmentPlugin: Plugin = {
    name: "vitest-cucumber:storybook",
    // Before Vite's resolver, and before the addon's transform.
    enforce: "pre",
    resolveId(source, importer) {
      if (!inStorybook(this.environment)) {
        return undefined;
      }
      // A feature module's id (a stories module's imports of it).
      if (featureFileOf(source)) {
        return source;
      }
      // A stories module's import of the addon's test utilities: its feature module.
      return storyTestsModuleId(source, importer);
    },
    async load(id) {
      if (!inStorybook(this.environment)) {
        return undefined;
      }
      const file = featureFileOf(id);
      if (file) {
        // From what its stories module was made (one reading of the file for both).
        return featureModule({
          cwd: core.root(),
          plan: await storybookPlans().storybookPlanOf(file),
        });
      }
      return undefined;
    },
    // A feature file: its stories module (browser mode's transform leaves it alone here).
    async transform(_code, id) {
      if (!inStorybook(this.environment) || !isFeatureFile(id)) {
        return undefined;
      }
      // One that can't be made (its parse errors, its links): its file fails with the error.
      const code = storiesModule(await storybookPlans().storybookPlanOf(id));
      // No map: none fits this code (browser mode's is a one-line map of the feature file).
      return { code, map: { mappings: "" } };
    },
  };

  /** A stories module's Vitest import, the feature module's (after the addon's transform). */
  const testsPlugin: Plugin = {
    name: "vitest-cucumber:storybook-tests",
    // After the addon's transform (a normal plugin's), before Vite's import analysis.
    enforce: "post",
    async transform(code, id) {
      const file = withoutQuery(id);
      if (
        !inStorybook(this.environment) ||
        id !== file ||
        !isFeatureFile(file)
      ) {
        return undefined;
      }
      // The support files, from what its stories module was made (one reading for both); a
      // feature that can't be used has no story tests here.
      const plan = await storybookPlans().storybookPlanOf(file);
      return vitestFromFeature({
        code,
        file,
        featureModule: featureModuleOf(file),
        testUtils,
        importSupport: importSupportCode(
          "error" in plan ? [] : plan.supportFiles,
        ),
      });
    },
  };

  return [environmentPlugin, testsPlugin];
};
