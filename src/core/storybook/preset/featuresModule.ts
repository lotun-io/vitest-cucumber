// Storybook's preview's features map (`../../../worker/storybook/featuresMap.ts`, a placeholder whose
// import the preset's plugin resolves to an id of its own, as the support module's: `./supportModule.ts`,
// so Vite serves it `no-cache`): each stories file's feature files, as the project's links have them
// (`./project.ts`: Storybook's index links every feature), each one's Gherkin written in (read as
// the module is made; no import of it: one of a deleted feature would
// fail the module in Vite's transform, and the preview with it), for `featuresOf`
// (`../../../worker/storybook/features.ts`).
//
// In `storybook dev` it accepts its own hot update (the dev server reloads it as it would be
// another: made again as the links change and at a feature file's event, and compared with the
// one last made, `createFeaturesMap`'s `changed`, `./devWatch.ts`; so a feature saved as it was,
// or one that runs on no stories file, reloads nothing), each copy of the module filling the
// page's one store and telling its listeners (`../../../worker/storybook/linkedFeatures.ts`),
// which `featuresOf` reads and `onFeaturesChange` subscribes to: the update ends here, not at
// Storybook's annotations (applied again in place, their `beforeAll` too), and a docs block that
// listens renders again with the new text. No file is touched for it.
import type { FeatureSource } from "../../../types/storybook.ts";
import { slash } from "../../../utils/slash.ts";
import { ownModule } from "../../utils/ownModule.ts";
import { withoutQuery } from "../../utils/withoutQuery.ts";

/** The placeholder's path, as Vite writes ids (`/`, on Windows too). */
const featuresPlaceholder = slash(ownModule("worker/storybook/featuresMap"));

/** Whether Vite's module `id` is the placeholder's (any query). */
export const isFeaturesMap = (id: string) =>
  slash(withoutQuery(id)) === featuresPlaceholder;

/** Whether an import's `source` may be the placeholder's (`./featuresMap.ts`, `.mjs`): resolved then. */
export const mayBeFeaturesMap = (source: string) =>
  /(?:^|\/)featuresMap(?:\.[cm]?[jt]s)?$/.test(withoutQuery(source));

/** The features map's id: not a file (`\0`). */
export const featuresMapId = "\0vitest-cucumber:storybook-features";

/** The features map's store: one for the page, filled by each copy of the map (`../../../worker/storybook/linkedFeatures.ts`). */
const linkedFeatures = ownModule("worker/storybook/linkedFeatures");

/**
 * The features map's code: the store filled with `features`, each stories file's (by its path
 * from the root: see `featuresMap.ts`), each feature's text written in; the store's `features`
 * and `onFeaturesChange` exported, as the placeholder's; and the module's acceptance of its own
 * hot update, written here (Vite reads a module's own source for it).
 */
export const featuresModuleCode = (
  features: Record<string, readonly FeatureSource[]>,
) =>
  [
    `import { features, fillFeatures, onFeaturesChange } from ${JSON.stringify(linkedFeatures)};`,
    `fillFeatures(${JSON.stringify(features, null, 2)});`,
    "export { features, onFeaturesChange };",
    "if (import.meta.hot) import.meta.hot.accept();",
    "",
  ].join("\n");

/**
 * A project's features map, as its preview serves it: its code made from `features` (each stories
 * file's, read as it's asked for) at each ask, the one last made remembered for `changed`.
 */
export const createFeaturesMap = (
  features: () => Promise<Record<string, readonly FeatureSource[]>>,
) => {
  /** The code last made: what a page that has the map was served, or told to fetch again. */
  let last: string | undefined;
  const make = async () => featuresModuleCode(await features());
  return {
    /** The map's code, made now (the module's `load`). */
    load: async () => {
      last = await make();
      return last;
    },
    /**
     * Makes the map again: whether it's another than the one last made (never made: no page has
     * it, so no). Two asks at once: the first to finish says so, the other finds it made.
     */
    changed: async () => {
      const now = await make();
      const before = last;
      last = now;
      return before !== undefined && now !== before;
    },
  };
};
