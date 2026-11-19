// Storybook, story tests: how the Vitest plugin gets Storybook's options (its config folder, its
// presets: what the preset's functions are given), which `cucumber()` isn't given and the addon
// keeps to itself. The addon applies every preset's `viteFinal` in its Vitest runs and adds the
// plugins it gives to the Vitest project (read in `@storybook/addon-vitest` 10.6.7, run as a
// spike 2026-11-19): there the preset's `viteFinal` gives a plugin that only carries the options
// (a plugin's `api`, Vite's way for two plugins to talk), which `cucumber()` finds by its name
// among its project's plugins. The whole options (the user's call): whatever story tests need of
// Storybook's config is asked of them, as the preset asks (today its `stories`, for a stories
// file's automatic title: `../stories/storiesTitle.ts`).
import { pluginError } from "../../../utils/errors.ts";
import type { PresetOptions } from "../preset/project.ts";

const optionsPlugin = "vitest-cucumber:storybook-options";

/** The preset's plugin: Storybook's options on its `api`, no hook. */
interface OptionsPlugin {
  name: string;
  api: { options: PresetOptions };
}

/** The preset's plugin for the addon's Vitest project: it carries Storybook's `options`, nothing else. */
export const storybookOptionsPlugin = (
  options: PresetOptions,
): OptionsPlugin => ({
  name: optionsPlugin,
  api: { options },
});

/** A plugin of that name is the preset's. */
const isOptionsPlugin = (plugin: { name: string }): plugin is OptionsPlugin =>
  plugin.name === optionsPlugin;

/**
 * Storybook's options, from a Storybook project's `plugins` (the preset's plugin's). The preset
 * not loaded: the plugin's error, with what to add.
 */
export const storybookOptionsOf = (
  plugins: readonly { name: string }[],
): PresetOptions => {
  const carrier = plugins.find(isOptionsPlugin);
  if (!carrier) {
    throw pluginError(
      `Storybook's preset of the plugin isn't loaded: add "@lotun/vitest-cucumber/storybook" to the "addons" of .storybook/main.ts`,
      { quiet: true },
    );
  }
  return carrier.api.options;
};
