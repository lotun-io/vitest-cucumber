// Storybook: a planned feature file made for Storybook (`../../feature/plans.ts`'s
// `storybookPlanOf`): linked to its stories file (`./linkedFeature.ts`, by the support files'
// Storybook steps) and its stories module written (`./featureStories.ts`), or, its links failing,
// what stops it (the plugin's error, every one listed). A hook writes the module its plan gives
// (`./featureStoriesModule.ts`).
import { pluginError } from "../../../utils/errors.ts";
import type { FailedPlan, VitestPlan } from "../../feature/plans.ts";
import type { FeatureLinks } from "./featureLinks.ts";
import { featureModuleOf } from "./featureRuntimeModule.ts";
import { featureStoriesOf } from "./featureStories.ts";
import { linkedFeatureOf } from "./linkedFeature.ts";
import type { StoriesOf } from "./storiesFile.ts";
import type { AutoTitleOf } from "./storiesTitle.ts";
import type { StorybookPlan } from "./storybookPlans.ts";

/**
 * Feature file `feature` (its Vitest `plan`; its links `linked`, with the Storybook steps' own
 * errors `stepErrors`) for the project at `root`: its links checked against its stories file's
 * stories (`storiesOf`), its title its stories file's (Storybook's automatic one: `autoTitleOf`),
 * its stories module written.
 * A feature file a Storybook project lists as stories must link to a stories file.
 */
export const storybookPlanFrom = async ({
  feature,
  plan,
  linked: links,
  stepErrors,
  storybookSteps,
  root,
  storiesOf,
  autoTitleOf,
}: {
  feature: string;
  plan: VitestPlan;
  linked: FeatureLinks;
  stepErrors: readonly string[];
  /** Whether a support file has a Storybook step (the plan's `storybookSteps`). */
  storybookSteps: boolean;
  root: string;
  /** A stories file's stories, as Storybook reads them (kept: `../../feature/plans.ts`). */
  storiesOf: (file: string) => Promise<StoriesOf>;
  /** Storybook's automatic title of a stories file (`./storiesTitle.ts`). */
  autoTitleOf: AutoTitleOf;
}): Promise<StorybookPlan | FailedPlan> => {
  const { uri, gherkin } = plan;
  const linked = await linkedFeatureOf({
    uri,
    root,
    linked: links,
    stepErrors,
    storiesOf,
    autoTitleOf,
  });
  const errors = [...linked.errors];
  if (!linked.storiesFile && errors.length === 0) {
    errors.push(
      `${uri} has no stories file: none is next to it (a stories file of its name), and none is named by a stories file step`,
    );
  }
  if (
    !linked.storiesFile ||
    !linked.stories ||
    linked.title === undefined ||
    errors.length > 0
  ) {
    return {
      // Each error names the feature file.
      error: pluginError(
        `Feature file can't be linked to stories:\n${errors.map((message) => `  - ${message}`).join("\n")}`,
        { quiet: true },
      ),
    };
  }
  const { code, title, label } = featureStoriesOf({
    feature,
    document: gherkin.document,
    storiesFile: linked.storiesFile,
    storiesTitle: linked.title,
    stories: linked.stories,
    links: linked.links,
    featureModule: featureModuleOf(feature),
  });
  return {
    ...plan,
    storybookSteps,
    stories: { code, title, label },
  };
};
