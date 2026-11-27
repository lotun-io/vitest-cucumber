// The Storybook steps' placeholders (`notes/storybook.md`, "Scenarios as tests of stories"): a step
// definition whose cucumber expression has one links its scenario to a story, or its feature to a
// stories file. The user words the steps; a placeholder is `{string}` as cucumber matches it (the
// user's call, 2026-11-27): the feature writes the value in quotes (`Given the "Primary" story`),
// the step gets it without them. Main reads the expressions from the support files
// (`../core/storybook/stories/storybookSteps.ts`) and Storybook's hosts define the steps
// (`../worker/storybook/story.ts`), each with the expression as rewritten here, so main links each
// scenario as cucumber will match its steps. No parameter type of the plugin's: none to clash with
// the user's (a regular expression's group is given the type whose pattern it is, two types of one
// pattern an error). Node and browser mode don't rewrite: a step with a placeholder there has an
// undefined parameter type. The names are namespaced (`storybook:`): no app's own parameter type has
// such a name. Everywhere.

/** The placeholders, by what each names: a story, a story the steps mount, the stories file. */
export const storybookPlaceholders = {
  /** A story of the stories file (an export name, or `default`: the meta): Storybook renders it before the steps. */
  story: "storybook:story",
  /** A story of the stories file (an export name, or `default`: the meta): the steps mount it. */
  storyUnmounted: "storybook:storyUnmounted",
  /** The feature's stories file (a path: from the project's root, or the feature's folder with `./`). */
  storiesFile: "storybook:storiesFile",
} as const;

/** Any of them, as written in an expression. */
const placeholder = new RegExp(
  String.raw`\{(?:${Object.values(storybookPlaceholders).join("|")})\}`,
  "g",
);

/** Cucumber expression `expression` with its Storybook placeholders as cucumber's `{string}`. */
export const storybookExpressionOf = (expression: string) =>
  expression.replaceAll(placeholder, "{string}");
