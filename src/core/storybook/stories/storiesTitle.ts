// Storybook: the title of a feature's stories file when it writes none (`./linkedFeature.ts`: a
// feature's title is its stories file's, then its label). Storybook's automatic one, made by its
// own function (`storybook/internal/common`'s `getStoryTitle`, the one its Vitest addon uses):
// the file's path from the folder of the first `stories` pattern that matches it. Without the
// pattern's `titlePrefix`: Storybook adds the prefix of the feature file's own pattern to the
// title a feature's stories module writes, as to any written title (a stories file's literal one
// is taken as written too). Both hosts make them from Storybook's options (its config folder,
// its presets' `stories`: `autoTitleOfStorybook`): the preset has them (`../preset/project.ts`),
// story tests get the same ones, the preset's (`../../storybookPlugin.ts`, from its `viteFinal`).
import type { StoriesEntry } from "storybook/internal/types";
import type { PresetOptions } from "../preset/project.ts";

/** Storybook's automatic title of stories file `file`; none: no `stories` pattern matches it. */
export type AutoTitleOf = (file: string) => Promise<string | undefined>;

/** Storybook's `stories` patterns (`entries`), and the folder they're written from. */
export interface StoriesPatterns {
  from: string;
  entries: StoriesEntry[];
}

/** A `stories` entry without its `titlePrefix`. */
const withoutPrefix = (entry: StoriesEntry): StoriesEntry =>
  typeof entry === "string"
    ? entry
    : {
        directory: entry.directory,
        ...(entry.files !== undefined && { files: entry.files }),
      };

/**
 * Storybook's automatic titles by `stories`, read at the first ask (Storybook's own function
 * loaded then: only a Storybook project asks).
 */
export const createAutoTitleOf = (
  stories: () => Promise<StoriesPatterns>,
): AutoTitleOf => {
  let patterns: Promise<StoriesPatterns> | undefined;
  return async (file) => {
    const { getStoryTitle } = await import("storybook/internal/common");
    const { from, entries } = await (patterns ??= stories());
    return getStoryTitle({
      storyFilePath: file,
      // Storybook's name for the folder its `stories` are written from.
      configDir: from,
      stories: entries.map(withoutPrefix),
    });
  };
};

/**
 * Storybook's automatic titles for the project of Storybook's `options` (asked at the first
 * title: a host may not have them before): its `stories`, written from its config folder.
 */
export const autoTitleOfStorybook = (options: () => PresetOptions) =>
  createAutoTitleOf(async () => {
    const storybook = options();
    return {
      from: storybook.configDir,
      entries: await storybook.presets.apply("stories", [], storybook),
    };
  });
