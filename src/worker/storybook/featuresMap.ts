// The features of each stories file: a placeholder. Where the preset runs (Storybook's dev server
// and its builds), its Vite plugin serves this module's code instead
// (`../../core/storybook/preset/featuresModule.ts`): it fills the page's store
// (`./linkedFeatures.ts`) with each stories file's linked feature files and their Gherkin, as main
// linked them (Storybook's index), and exports the store's `features` and `onFeaturesChange`.
// Elsewhere (story tests: no docs) its own code: no features, and nothing ever changes.
// Its own values, not the store's exported again: the build would then have `./features.ts`
// import the store itself, and the page never ask for this module (the served one). Page code.
import type { FeatureSource } from "../../types/storybook.ts";

/** Each stories file's features, by its path from the project's root (`./src/Header.stories.ts`). */
export const features: Record<string, readonly FeatureSource[]> = {};

/** Calls `listener` as the features change: never here (its stop returned). */
export const onFeaturesChange: (listener: () => void) => () => void =
  () => () =>
    undefined;
