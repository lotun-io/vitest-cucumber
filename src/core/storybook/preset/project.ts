// Storybook: a Storybook project's cucumber, by its config folder (one per process: the preset's
// preview plugin and its indexer share it, in Storybook's own process and in the addon's Vitest,
// which loads presets too): its root, its configuration (the addon entry's options, `cucumber({ … })`
// in `.storybook/main.ts`: `../addon.ts`) and its feature
// files' plans (`../../feature/plans.ts`, and Storybook's on them:
// `../stories/storybookPlans.ts`), with Storybook's automatic titles (`../stories/storiesTitle.ts`:
// its `stories`, as its presets give them).
import path from "node:path";
import type { Options } from "storybook/internal/types";
import type { CucumberOptions } from "../../../types/feature.ts";
import type { FeatureSource } from "../../../types/storybook.ts";
import { createFeaturePlans } from "../../feature/plans.ts";
import { configurationOf } from "../../plugin/options.ts";
import { addonOptionsKey, type AddonOptions } from "../addon.ts";
import { autoTitleOfStorybook } from "../stories/storiesTitle.ts";
import { createStorybookPlans } from "../stories/storybookPlans.ts";
import { importPathOf } from "./importPath.ts";

/** Storybook's options to a preset's functions: its config folder, its presets, the addon entry's options. */
export type PresetOptions = Pick<Options, "configDir" | "presets"> &
  AddonOptions;

/** The plugin's options: the addon entry's (none: the preset listed by its name, `import` missing). */
export const cucumberOptionsOf = (
  options: PresetOptions,
): Partial<CucumberOptions> => options[addonOptionsKey] ?? {};

/** A Storybook project's cucumber: its configuration (the addon entry's options) and its plans. */
const projects = new Map<string, ReturnType<typeof createProject>>();

const createProject = (options: PresetOptions) => {
  const { configDir } = options;
  // The Storybook project's folder, where its config folder is (`storybook dev` runs there; the
  // addon's Vitest, which loads presets too, may run elsewhere: the workspace's root).
  const root = path.dirname(path.resolve(configDir));
  /** `storybook dev`: what its dev server makes again as the linked features change (the features map: `./devWatch.ts`). */
  let linkedFeaturesChanged: (() => void | Promise<void>) | undefined;
  /**
   * `storybook dev`: who has feature files indexed again (Storybook's index: `../preset.ts`'s
   * server channel hook, the only one that can reach it).
   */
  const indexers = new Set<(features: readonly string[]) => Promise<void>>();
  const configuration = configurationOf(cucumberOptionsOf(options));
  const plans = createFeaturePlans({ root: () => root, configuration });
  const storybookPlans = createStorybookPlans({
    plans,
    root: () => root,
    configuration,
    autoTitleOf: autoTitleOfStorybook(options),
    onLinkedFeaturesChanged: () => {
      void linkedFeaturesChanged?.();
    },
  });
  return {
    root,
    plans,
    /** The feature files' Storybook plans, on `plans`. */
    storybookPlans,
    /** `storybook dev`: `listener` is called as the linked features change (`featuresMap`'s). */
    onLinkedFeaturesChanged: (listener: () => void | Promise<void>) => {
      linkedFeaturesChanged = listener;
    },
    /** `storybook dev`: `listener` has feature files indexed again (Storybook's index). */
    onIndexOutOfDate: (
      listener: (features: readonly string[]) => Promise<void>,
    ) => {
      indexers.add(listener);
    },
    /** Feature files `features`' index entries are out of date: Storybook's index is told. */
    indexOutOfDate: async (features: readonly string[]) => {
      if (features.length > 0) {
        await Promise.all([...indexers].map((index) => index(features)));
      }
    },
    /**
     * Each stories file's feature files (`./featuresModule.ts`), by their import paths (as Storybook's
     * index writes them: a docs page's `parameters.fileName`, `./importPath.ts`): the feature
     * files linked so far that have a stories file (their links may fail), each file's features
     * in their paths' order, each with its text as the plans read it (one that can't be read
     * left out).
     */
    featuresMap: async () => {
      const features: Record<string, FeatureSource[]> = {};
      for (const [feature, storiesFile] of storybookPlans.links
        .linked()
        .sort(([a], [b]) => a.localeCompare(b))) {
        const read = await plans.fileOf(feature).catch(() => undefined);
        if (read) {
          (features[importPathOf(storiesFile)] ??= []).push({
            fileName: importPathOf(feature),
            source: read.content,
          });
        }
      }
      return features;
    },
  };
};

/**
 * The project of Storybook's config folder (`options.configDir`; one per process): the plugin's
 * and indexers', made with the options of the first to ask (Storybook gives every preset
 * function the same).
 */
export const projectOf = (options: PresetOptions) => {
  let project = projects.get(options.configDir);
  if (!project) {
    project = createProject(options);
    projects.set(options.configDir, project);
  }
  return project;
};
