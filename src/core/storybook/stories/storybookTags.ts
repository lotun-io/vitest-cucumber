// Storybook: a scenario's tags as its story's and its test's. A Gherkin tag written `@tag(<name>)`
// is the tag `<name>` (`../../feature/tagTransform.ts`, the user's call 2026-11-27, replacing the
// four special `@dev`, `@!dev`, `@test`, `@!test` of 2026-11-26): Storybook's own tags are written
// so (`@tag(!dev)` leaves a scenario's story out of the sidebar, `@tag(!test)` out of story tests,
// `@tag(dev)` puts back what a feature's tag, the story it runs on or its stories file's meta took
// away: Storybook combines them in order); any other is as it's written (`@smoke`). A story has
// every tag of its scenario's. Its test, every one but Storybook's tags (the user's call,
// 2026-11-27): a tag the scenario takes off (`!smoke`) and the one it takes off (`smoke`), and
// Storybook's built-in tags (its `Tag`: `dev`, `test`, `autodocs`, `manifest`, `play-fn`, …),
// taken off (`!dev`) or not: they say what a story is in Storybook, not what a test is (and
// Vitest reads a `!` in a tag filter as "not"; a test with `smoke` its story hasn't would run as
// `smoke`). A tag taken off and put back (`!smoke`, then `smoke`) is the story's, not the test's. `autodocs` and
// `manifest` are always taken off a scenario's story after its tags (`./featureStories.ts`).
// Storybook's tags are its own constants, `Tag` (`storybook/preview-api`, public API), never written
// here.
import { Tag } from "storybook/preview-api";

/** Storybook's built-in tags, by name (`Tag`: `Tag.DEV` is `dev`). */
export type StorybookTags = typeof Tag;

/** Storybook's built-in tags (`storybook/preview-api`'s `Tag`). */
export const storybookTags: StorybookTags = Tag;

/** Storybook tag `tag`, taken off (`!dev`). */
export const without = (tag: string) => `!${tag}`;

/**
 * A scenario's `tags` (its pickle's, `@tag(<name>)` as `<name>`) as its Vitest test's: without
 * Storybook's, the ones it takes off (`!smoke`, and `smoke`) and the built-in ones (`builtIns`),
 * taken off (`!dev`) or not.
 */
export const testTagsOf = (
  tags: readonly string[],
  builtIns: StorybookTags,
) => {
  const storybook = new Set<string>(Object.values(builtIns));
  for (const tag of tags) {
    if (tag.startsWith("!")) {
      storybook.add(tag.slice(1));
    }
  }
  return tags.filter((tag) => !storybook.has(tag.replace(/^!/, "")));
};

/**
 * A project's Gherkin `tags` (every feature file's) as the Vitest tags it declares: every tag a
 * test may have (`testTagsOf`), so without the `!` forms and Storybook's built-in ones. A tag one
 * scenario takes off is still declared (another may have it: Vitest refuses a test's tag it
 * doesn't know; one no test has is no error).
 */
export const declaredTagsOf = (
  tags: readonly string[],
  builtIns: StorybookTags,
) => {
  const storybook = new Set<string>(Object.values(builtIns));
  return tags.filter((tag) => !tag.startsWith("!") && !storybook.has(tag));
};
