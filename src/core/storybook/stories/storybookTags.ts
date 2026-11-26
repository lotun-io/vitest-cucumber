// Storybook: its own tags, as a feature file writes them (the user's call, 2026-11-26). Every
// story has `dev` (it's listed in the sidebar) and `test` (the Vitest addon runs it), and a tag
// starting with `!` takes one away, in order: a scenario's `@!dev` leaves its story out of the
// sidebar, `@!test` out of story tests, and `@dev` or `@test` puts back what a feature's tag, the
// story it runs on or its stories file's meta took away. So these four Gherkin tags are a
// scenario's story's Storybook tags, without the `@`; any other Gherkin tag is a Storybook tag as
// it's written (`@smoke`). They aren't its Vitest test's tags: they say where a story is, not
// what a test is (and Vitest reads a `!` in a tag filter as "not"). Storybook's other system
// tags aren't a feature's to write: `autodocs` and `manifest` are always taken off a scenario's
// story (`./featureStories.ts`), the rest Storybook sets itself (`play-fn`, …).

/** Each Gherkin tag that is one of Storybook's own, with that tag. */
const storybookTags = new Map([
  ["@dev", "dev"],
  ["@!dev", "!dev"],
  ["@test", "test"],
  ["@!test", "!test"],
]);

/** A scenario's Gherkin `tags` as its story's: Storybook's own without the `@`, in their order. */
export const storyTagsOf = (tags: readonly string[]) =>
  tags.map((tag) => storybookTags.get(tag) ?? tag);

/** A scenario's Gherkin `tags` as its Vitest test's: without Storybook's own. */
export const testTagsOf = (tags: readonly string[]) =>
  tags.filter((tag) => !storybookTags.has(tag));
