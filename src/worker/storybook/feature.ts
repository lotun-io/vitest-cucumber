// A feature file, as its stories module gets it (`../../core/storybook/stories/featureStories.ts` imports it):
// `playAt({ line, unmounted })`, the play of the scenario, or Outline row, at that line (its
// pickle's: a line with none fails as the story plays); `storyOf` and `metaOf`, what the module
// takes of its stories file (the story a scenario runs on, none: the meta's defaults). Each play is marked
// as a scenario's, with its line (`./scenarioPlay.ts`).
//
// A scenario plays only its steps: the story's own `play` (and the meta's) is the story's own test.
// Storybook renders a story before its `play` unless the play uses `mount` (destructures it), which
// it reads from the play's text: a scenario's play doesn't, so Storybook renders the story first; an
// unmounted one's does (`Given the unmounted Primary story`), so its `Before` hooks and steps run
// before the render, and the user's step mounts it (`story().mount(…)`): if none does, Storybook's
// preview fails it (`NoStoryMountedError`).
import type { FeatureModel } from "../../types/storybook.ts";
import { markScenario } from "./scenarioPlay.ts";
import { runStory, type StoryContextLike } from "./story.ts";

/** A stories file's story as a scenario's story's base: a function story's function its `render`. */
const storyOf = (story: unknown): object => {
  if (typeof story === "function") {
    return { ...story, render: story };
  }
  return typeof story === "object" && story !== null ? story : {};
};

/**
 * A stories file's meta as a feature's stories module's: without the stories it selects
 * (`includeStories`, `excludeStories`: they'd select the module's), its `play` (a scenario plays
 * only its steps) or its `id` (the module writes the feature's own: its stories' ids, whatever
 * their titles, `../../core/storybook/stories/featureStories.ts`).
 */
const metaOf = (meta: unknown): object => {
  if (typeof meta !== "object" || meta === null) {
    return {};
  }
  const {
    includeStories: _include,
    excludeStories: _exclude,
    play: _play,
    id: _id,
    ...rest
  } = meta as Record<string, unknown>;
  return rest;
};

export const createFeature = (model: FeatureModel) => ({
  storyOf,
  metaOf,
  /** The play of the scenario, or Outline row, at `line`, unmounted or not, marked with its line. */
  playAt: ({ line, unmounted }: { line: number; unmounted: boolean }) => {
    const target = { ...model, line };
    const play: (context: StoryContextLike) => Promise<void> = unmounted
      ? // Destructures `mount`: Storybook doesn't render the story before it.
        async ({ mount, ...rest }) => {
          await runStory({ ...rest, mount }, target);
        }
      : async (context) => {
          await runStory(context, target);
        };
    return markScenario(play, { line });
  },
});
