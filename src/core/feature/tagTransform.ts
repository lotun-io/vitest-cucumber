// A Gherkin tag written as `@tag(<name>)` is the tag `<name>` (the user's call, 2026-11-27): a tag
// without Gherkin's `@`, as Vitest's tag filters and definitions (`--tags-filter smoke`,
// `{ name: "smoke" }`) and Storybook's own tags (`dev`, `!dev`) name them. In every mode, as main
// plans a feature file: its pickles' tags (what cucumber's hooks match and its messages show, and
// its tests' Vitest tags: `./featureTree.ts`) and the tags its project declares (`./featureTags.ts`).
// The Gherkin document keeps the tag as written. Any other tag is as it's written (`@smoke`).

/** `@tag(<name>)`: its name (anything but empty). */
const transformed = /^@tag\((.+)\)$/s;

/** Gherkin tag `tag` as the plugin has it: `@tag(<name>)`'s name, any other as it's written. */
export const tagOf = (tag: string) => transformed.exec(tag)?.[1] ?? tag;
