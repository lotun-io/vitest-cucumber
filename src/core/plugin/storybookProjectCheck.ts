// A Storybook project (Storybook's Vitest plugin, `storybookTest()`'s, among its plugins) gets the
// plugin from its addon in `.storybook/main.ts` (`cucumber({ … })` from
// `@lotun/vitest-cucumber/storybook/node`: its preset gives the project's plugins,
// `../storybookPlugin.ts`): a `cucumber()` there too (written there, or the declaring config's,
// which an inline project inherits unless `extends: false`) would make every feature file twice, so
// it's refused.
import { pluginError } from "../../utils/errors.ts";

/** Storybook's Vitest plugin (`storybookTest()`'s), which marks a Storybook project. */
const storybookTestPlugin = "vite-plugin-storybook-test";

/** Throws if a project of `plugins` (resolved) is a Storybook one: `cucumber()` doesn't belong there. */
export const checkNotInStorybookProject = (
  plugins: readonly { name: string }[],
) => {
  if (plugins.some(({ name }) => name === storybookTestPlugin)) {
    throw pluginError(
      "cucumber() doesn't go in a Storybook project's Vitest config, add it to the addons in .storybook/main.ts",
      { quiet: true },
    );
  }
};
