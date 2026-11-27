// The Storybook steps: each feature's Background names its stories file and its story (the meta),
// each in quotes. Worded alike in every project, defined by the host that runs them: Storybook's
// (story tests, the preview) with the plugin's placeholders (`{string}` there), the root's `node`
// and `browser` projects with cucumber's own `{string}` (the plugin's placeholders are Storybook's
// only). Main finds Storybook's steps in this file's text (`Given(` and a string literal),
// whichever branch runs. Each does nothing.
import { Given } from "@cucumber/cucumber";

/**
 * Whether Storybook runs this: its env's `STORYBOOK`, which Storybook's CLI sets for its preview and
 * the Vitest addon for its story tests (`presets.apply("env")`); node and browser mode have none.
 */
const storybook = import.meta.env.STORYBOOK !== undefined;

if (storybook) {
  Given("the stories of {storybook:storiesFile}", (_file: string) => undefined);
  Given("the {storybook:story} story", (_story: string) => undefined);
} else {
  Given("the stories of {string}", (_file: string) => undefined);
  Given("the {string} story", (_story: string) => undefined);
}
