// Storybook: a planned feature file made for Storybook (`./storybookPlans.ts`'s
// `storybookPlanOf`): linked to its stories file (`./linkedFeature.ts`, by the support files'
// Storybook steps) and its stories module written (`./featureStories.ts`), or, its links failing,
// what stops it (the plugin's error, every one listed). A hook writes the module its plan gives
// (`./featureStoriesModule.ts`).
import type { FeatureSuite } from "../../../types/feature.ts";
import { pluginError } from "../../../utils/errors.ts";
import type { FailedPlan, VitestPlan } from "../../feature/plans.ts";
import type { FeatureLinks } from "./featureLinks.ts";
import { featureModuleOf } from "./featureRuntimeModule.ts";
import { featureStoriesOf, featureStoryExport } from "./featureStories.ts";
import { linkedFeatureOf, type SameLabel } from "./linkedFeature.ts";
import type { StoriesOf } from "./storiesFile.ts";
import type { AutoTitleOf } from "./storiesTitle.ts";
import type { StorybookPlan } from "./storybookPlans.ts";
import { storybookTagsOf, testTagsOf } from "./storybookTags.ts";
import { sameIdErrorsOf } from "./storyIds.ts";

/** `tree` with each test's tags `tagsOf` its own. */
const withTestTags = (
  tree: FeatureSuite,
  tagsOf: (tags: readonly string[]) => string[],
): FeatureSuite => ({
  ...tree,
  children: tree.children.map((child) =>
    "children" in child
      ? withTestTags(child, tagsOf)
      : { ...child, tags: tagsOf(child.tags) },
  ),
});

/**
 * Feature file `feature` (its Vitest `plan`; its links `linked`, with the Storybook steps' own
 * errors `stepErrors`) for the project at `root`: its links checked against its stories file's
 * stories (`storiesOf`), its title its stories file's (Storybook's automatic one: `autoTitleOf`),
 * its stories module written. One that can't be linked (`./linkedFeature.ts`: no stories file,
 * its `label`'s id another feature's on it, `sameLabel`, …) is stopped by its links' errors; one
 * whose stories have one id between two of them (`./storyIds.ts`), by those.
 */
export const storybookPlanFrom = async ({
  feature,
  plan,
  linked: links,
  label,
  sameLabel,
  stepErrors,
  root,
  storiesOf,
  autoTitleOf,
}: {
  feature: string;
  plan: VitestPlan;
  linked: FeatureLinks;
  /** Its label (`Feature: <name>`). */
  label: string;
  /** The other feature files on its stories file whose labels give its id (by path). */
  sameLabel: readonly SameLabel[];
  stepErrors: readonly string[];
  root: string;
  /** A stories file's stories, as Storybook reads them (kept: `./storybookPlans.ts`). */
  storiesOf: (file: string) => Promise<StoriesOf>;
  /** Storybook's automatic title of a stories file (`./storiesTitle.ts`). */
  autoTitleOf: AutoTitleOf;
}): Promise<StorybookPlan | FailedPlan> => {
  const { uri, gherkin, featureTree } = plan;
  // Storybook's own ids (`storybook/internal/csf`: loaded only in Storybook projects).
  const { sanitize, storyNameFromExport, toId } =
    await import("storybook/internal/csf");
  // Storybook's built-in tags (`Tag`).
  const tag = await storybookTagsOf();
  const linked = await linkedFeatureOf({
    uri,
    root,
    linked: links,
    stepErrors,
    label,
    sameLabel,
    storiesOf,
    autoTitleOf,
    idOf: sanitize,
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
  const { code, title, titles, scenarios } = featureStoriesOf({
    feature,
    document: gherkin.document,
    tree: featureTree,
    storiesFile: linked.storiesFile,
    storiesTitle: linked.title,
    stories: linked.stories,
    links: linked.links,
    featureModule: featureModuleOf(feature),
    idOf: sanitize,
    tag,
  });
  // Two of its stories with one id: stopped, each named (its module isn't used).
  const sameIds = sameIdErrorsOf({
    uri,
    document: gherkin.document,
    metaId: sanitize(title),
    own: featureStoryExport,
    stories: scenarios,
    ids: { toId, storyNameFromExport },
  });
  if (sameIds.length > 0) {
    return { error: pluginError(sameIds.join("\n"), { quiet: true }) };
  }
  return {
    ...plan,
    // Its tests' Vitest tags: their Gherkin tags but Storybook's own (`./storybookTags.ts`).
    featureTree: withTestTags(featureTree, (tags) => testTagsOf(tags, tag)),
    stories: { code, title, titles },
  };
};
