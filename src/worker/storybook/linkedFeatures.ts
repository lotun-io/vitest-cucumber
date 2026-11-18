// The features map's store: each stories file's features, and who's told as they change. The map
// module the preset serves (`./featuresMap.ts`'s placeholder, its code:
// `../../core/storybook/preset/featuresModule.ts`) fills it; `featuresOf` reads it and
// `onFeaturesChange` subscribes to it (`./features.ts`). In `storybook dev` the map module is
// served again as features change (its own hot update, which ends there, not at Storybook's
// annotations) and fills this again: one object and one set of listeners for the page, kept here
// (a module of the plugin's, loaded once and never hot-updated), so an open page reads the new
// map and a docs block that listens renders again. Page code.
import type { FeatureSource } from "../../types/storybook.ts";

/** Each stories file's features, by its path from the project's root (`./src/Header.stories.ts`). */
export const features: Record<string, readonly FeatureSource[]> = {};

/** Who's told as the map is filled again. */
const listeners = new Set<() => void>();

/** The map as main made it (`linked`: each stories file's features): `features` filled with it, the listeners told. */
export const fillFeatures = (
  linked: Readonly<Record<string, readonly FeatureSource[]>>,
) => {
  for (const storiesFile of Object.keys(features)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the map's keys are its entries
    delete features[storiesFile];
  }
  Object.assign(features, linked);
  for (const listener of [...listeners]) {
    listener();
  }
};

/** Calls `listener` each time the map is filled again, until the function it returns is called. */
export const onFeaturesChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
