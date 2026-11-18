// The feature files of a stories file, for docs (a docs page's own block: `featuresOf` with the
// page's stories file, `useOf("meta").preparedMeta.parameters.fileName`): every feature whose
// scenarios run on its stories, next to it or naming it in a stories file step, with its Gherkin as
// written. From the preset's map (`./featuresMap.ts`): in Storybook's preview (dev and static
// builds); none in story tests. In `storybook dev` the map changes as features do, and
// `onFeaturesChange` tells: with `featuresOf`, what React's `useSyncExternalStore` takes (a
// block's hook is the user's: nothing of React here). Page code.
import type { FeatureSource } from "../../types/storybook.ts";
import { features, onFeaturesChange as onMapChange } from "./featuresMap.ts";

export type { FeatureSource };

/** No features: one array, so a stories file without any has the same one at each ask. */
const none: readonly FeatureSource[] = [];

/**
 * The feature files of stories file `storiesFile` (its path from the project's root, as Storybook's
 * `parameters.fileName` has it: `./src/Header.stories.ts`), in their paths' order; none if none
 * runs on it. The same array until the features change.
 */
export const featuresOf = (storiesFile: string): readonly FeatureSource[] =>
  featuresIn(features, storiesFile);

/**
 * Calls `listener` each time the stories files' features change (`storybook dev`: a feature file
 * saved with another text, added, deleted, or running on another stories file), until the
 * function it returns is called. Nothing changes in a static build or in story tests.
 */
export const onFeaturesChange = (listener: () => void): (() => void) =>
  onMapChange(listener);

/** `storiesFile`'s features in map `features` (its path with or without its leading `./`). */
export const featuresIn = (
  features: Readonly<Record<string, readonly FeatureSource[]>>,
  storiesFile: string,
): readonly FeatureSource[] =>
  features[storiesFile.startsWith("./") ? storiesFile : `./${storiesFile}`] ??
  none;
