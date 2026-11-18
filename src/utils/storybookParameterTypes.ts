// The plugin's parameter types of the Storybook steps (`notes/storybook.md`, "Scenarios as tests of
// stories"): a step definition whose expression uses one links its scenario to a story, or its
// feature to a stories file. The user words the steps; Storybook's hosts define the types, all three
// but any the support code defined itself, when main finds such a step in a support file
// (`../worker/storybook/story.ts`; never in node and browser mode), and main reads the
// expressions from the support files (`../core/storybook/stories/storybookSteps.ts`) and matches them with these
// same patterns, so it links each scenario as cucumber will match its steps. Their names are
// namespaced (`storybook:`): no app's own parameter type has such a name. Everywhere.

/** The plugin's story parameter types: each one's name (as written in `{…}`) and pattern. */
export const storybookParameterTypes = {
  /** A story of the stories file (an export name, or `default`: the meta): Storybook renders it before the steps. */
  story: { name: "storybook:story", regexp: /\w+/ },
  /** A story of the stories file (an export name, or `default`: the meta): the steps mount it. */
  storyUnmounted: { name: "storybook:storyUnmounted", regexp: /\w+/ },
  /** The feature's stories file (a path: from the project's root, or the feature's folder with `./`). */
  storiesFile: { name: "storybook:storiesFile", regexp: /\S+/ },
} as const;
