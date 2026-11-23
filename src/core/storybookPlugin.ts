// Storybook: a Storybook project's plugins in its story tests (the addon's Vitest runs), which the
// preset gives (its `viteFinal`: the addon adds a preset's plugins to its Vitest project, so only a
// Storybook project has these), from Storybook's options (the addon entry's among them: the
// plugin's options). Browser mode's hooks (`./browserPlugin.ts`), without its transform: a feature
// file (a test file: the project's `include` comes from Storybook's `stories`) is its stories module
// (`./storybook/stories/featureStories.ts`: its stories file's meta, a story per scenario), and its
// feature module is served (`./storybook/stories/featureRuntimeModule.ts`, which loads the support
// code with the project's root and the run's options). The story tests are the addon's, from the
// stories module (its transform runs between these two plugins'), handed to the plugin's runtime:
// the module's import of the addon's test utilities resolved to its feature module, its Vitest
// import the feature module's `vitest`, and the feature's tests declared after the addon's
// (`./storybook/vitest/vitestImport.ts`).
import type { Plugin } from "vitest/config";
import { createBrowserHooks } from "./browserPlugin.ts";
import { isFeatureFile } from "./feature/featureFile.ts";
import {
  cucumberOptionsOf,
  type PresetOptions,
} from "./storybook/preset/project.ts";
import {
  featureFileOf,
  featureModule,
  featureModuleOf,
  storyTestsModuleId,
  testUtils,
} from "./storybook/stories/featureRuntimeModule.ts";
import { storiesModule } from "./storybook/stories/featureStoriesModule.ts";
import { autoTitleOfStorybook } from "./storybook/stories/storiesTitle.ts";
import { createStorybookPlans } from "./storybook/stories/storybookPlans.ts";
import { vitestFromFeature } from "./storybook/vitest/vitestImport.ts";
import { importSupportCode } from "./support/importSupportCode.ts";
import { withoutQuery } from "./utils/withoutQuery.ts";

/** A Storybook project's plugins in story tests, from Storybook's `options` (the preset's). */
export const createStorybookPlugin = (options: PresetOptions): Plugin[] => {
  const { core, hooks } = createBrowserHooks(cucumberOptionsOf(options));
  /**
   * The Storybook plans, on the plugin's feature plans, told a watching Vitest's file changes after
   * the feature plans; the features they say are out of date are rerun. A stories file's automatic
   * title is Storybook's, by its options.
   */
  const plans = createStorybookPlans({
    plans: core.featurePlans,
    root: core.root,
    configuration: core.configuration,
    autoTitleOf: autoTitleOfStorybook(() => options),
  });
  core.onFileChange(async (type, file) => {
    const { staleFeatures } = await plans.onFileChange(type, file);
    staleFeatures.forEach(core.rerun);
  });

  /** A feature file as its stories module, and its feature module. */
  const storiesPlugin: Plugin = {
    name: "vitest-cucumber:storybook",
    // Before Vite's resolver, and before the addon's transform.
    enforce: "pre",
    resolveId(source, importer) {
      // A feature module's id (a stories module's imports of it).
      if (featureFileOf(source)) {
        return source;
      }
      // A stories module's import of the addon's test utilities: its feature module.
      return storyTestsModuleId(source, importer);
    },
    async load(id) {
      const file = featureFileOf(id);
      if (file) {
        // From what its stories module was made (one reading of the file for both).
        return featureModule({
          cwd: core.root(),
          plan: await plans.storybookPlanOf(file),
        });
      }
      return undefined;
    },
    async transform(_code, id) {
      if (!isFeatureFile(id)) {
        return undefined;
      }
      // One that can't be made (its parse errors, its links): its file fails with the error.
      const code = storiesModule(await plans.storybookPlanOf(id));
      // No map: none fits this code.
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
      if (id !== file || !isFeatureFile(file)) {
        return undefined;
      }
      // The support files, from what its stories module was made (one reading for both); a
      // feature that can't be used has no story tests here.
      const plan = await plans.storybookPlanOf(file);
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

  return [
    // Browser mode's hooks: its config, the page's `@cucumber/cucumber`, the project set up.
    { name: "vitest-cucumber:browser", enforce: "pre", ...hooks },
    storiesPlugin,
    testsPlugin,
  ];
};
