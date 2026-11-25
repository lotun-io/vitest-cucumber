// Storybook: a planned feature file made for Storybook (`./storybookPlans.ts`'s
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
 * its stories module written. One that can't be linked (`./linkedFeature.ts`: no stories file,
 * its `label` another feature's on it, `sameLabel`, …) is stopped by its links' errors.
 */
export const storybookPlanFrom = async ({
  feature,
  plan,
  linked: links,
  label,
  sameLabel,
  stepErrors,
  storybookSteps,
  root,
  storiesOf,
  autoTitleOf,
}: {
  feature: string;
  plan: VitestPlan;
  linked: FeatureLinks;
  /** Its label (`Feature: <name>`). */
  label: string;
  /** The other feature files on its stories file with its label (paths with `/`, by path). */
  sameLabel: readonly string[];
  stepErrors: readonly string[];
  /** Whether a support file has a Storybook step (the plan's `storybookSteps`). */
  storybookSteps: boolean;
  root: string;
  /** A stories file's stories, as Storybook reads them (kept: `./storybookPlans.ts`). */
  storiesOf: (file: string) => Promise<StoriesOf>;
  /** Storybook's automatic title of a stories file (`./storiesTitle.ts`). */
  autoTitleOf: AutoTitleOf;
}): Promise<StorybookPlan | FailedPlan> => {
  const { uri, gherkin, featureTree } = plan;
  const linked = await linkedFeatureOf({
    uri,
    root,
    linked: links,
    stepErrors,
    label,
    sameLabel,
    storiesOf,
    autoTitleOf,
  });
  if ("errors" in linked) {
    return {
      // Each error names the feature file.
      error: pluginError(
        `feature file can't be linked to stories:\n${linked.errors.map((message) => `  - ${message}`).join("\n")}`,
        { quiet: true },
      ),
    };
  }
  // Storybook's own ids (`storybook/internal/csf`: loaded only in Storybook projects).
  const { sanitize } = await import("storybook/internal/csf");
  const { code, title, titles } = featureStoriesOf({
    feature,
    document: gherkin.document,
    tree: featureTree,
    storiesFile: linked.storiesFile,
    storiesTitle: linked.title,
    stories: linked.stories,
    links: linked.links,
    featureModule: featureModuleOf(feature),
    idOf: sanitize,
  });
  return {
    ...plan,
    storybookSteps,
    stories: { code, title, titles },
  };
};
