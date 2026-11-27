// A path (with `/`) as Storybook writes a relative one: `./` before it unless it already starts
// with `./` or `../` (Storybook's own rule, its `normalizeStoryPath`). Not "starts with a `.`": a
// folder may be named so (`.design/Card.stories.tsx` is `./.design/…`), and `../x` is relative
// already (not `./../x`). Page-safe.

/** `file` (with `/`) as a relative path: `./` before it unless it starts with `./` or `../`. */
export const asRelative = (file: string) =>
  /^\.{1,2}(\/|$)/.test(file) ? file : `./${file}`;
