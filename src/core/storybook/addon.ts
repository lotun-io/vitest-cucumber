// Storybook: the plugin as a Storybook addon with its options, an entry of `.storybook/main.ts`'s
// `addons` (`cucumber({ … })`, exported by `@lotun/vitest-cucumber/storybook/node`: `./node.ts`).
// Storybook loads its preset (`<name>/preset`) and gives the preset's functions the entry's
// options, merged into its own (`applyPresets`: Storybook's options, then the entry's), in its own
// program and in story tests: so they're nested under one key, which no setting of Storybook's can
// be. The preset reads them there (`./preset/project.ts`).
import type { CucumberOptions } from "../../types/feature.ts";

/** The preset's options key for the plugin's options. */
export const addonOptionsKey = "vitestCucumber";

/** The addon entry's options, as the preset's functions get them (among Storybook's). */
export interface AddonOptions {
  [addonOptionsKey]?: CucumberOptions;
}

/** The plugin as an entry of Storybook's `addons`, with its options. */
export const cucumber = (options: CucumberOptions = {}) => ({
  name: "@lotun/vitest-cucumber/storybook",
  options: { [addonOptionsKey]: options } satisfies AddonOptions,
});
