// `@lotun/vitest-cucumber/storybook`, the page's (`.storybook/main.ts` uses
// `@lotun/vitest-cucumber/storybook/node`: `../../core/storybook/node.ts`): what steps use: `story()`, the
// running story; what docs use: `featuresOf()`, a stories file's feature files, and
// `onFeaturesChange()`, told as they change (`./features.ts`). The Storybook steps' placeholders
// need no export: Storybook's hosts read them as `{string}` (`./story.ts`'s `expressionOf`). A feature file
// is a stories module of its own, each scenario a story on a story of its stories file
// (`../../core/storybook/stories/featureStories.ts`). No import of Vitest's or
// Storybook's: the page's runner is the preset's (its project annotation: `./preview/annotation.ts`
// in Storybook's preview, `./vitest/annotation.ts` in its story tests).
// With its types a project gets cucumber's hooks typed for the World as a first argument.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- an ambient declaration: no import brings one in
/// <reference path="../../types/cucumber.d.mts" preserve="true" />
import { pluginError } from "../../utils/errors.ts";
import { currentStory } from "./story.ts";

export {
  featuresOf,
  onFeaturesChange,
  type FeatureSource,
} from "./features.ts";

/** The running story's context (Storybook's `StoryContext`), for steps. */
export const story = <Context = unknown>(): Context => {
  const context = currentStory();
  if (context === undefined) {
    throw pluginError(
      "no story is running (`story()` works in a step of a scenario's story)",
    );
  }
  return context as Context;
};
