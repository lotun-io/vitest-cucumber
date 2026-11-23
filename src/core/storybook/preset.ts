// Storybook: the preset of `@lotun/vitest-cucumber/storybook` (Storybook loads its `/preset`).
// Cucumber runs in Storybook's preview page itself (`../../worker/storybook/preview/`), in its dev
// server and in a static build alike: no server side. The preset adds a preview annotation (the
// page's runner, cucumber's BeforeAll and AfterAll: `../../worker/storybook/preview/annotation.ts`;
// story tests' own in the addon's Vitest runs), the preview's Vite plugin (`./preset/previewPlugin.ts`) and
// our indexer for `.feature` (`./preset/indexer.ts`). Its options are its addon entry's
// (`cucumber({ … })` in `.storybook/main.ts`: `./addon.ts`). The addon's own
// Vitest runs load presets too: there, the annotation is story tests' own, and its `viteFinal` gives
// the Storybook project's plugins (`../storybookPlugin.ts`). In `storybook dev` it also tells Storybook's
// index of the feature files whose entries are out of date (`experimental_serverChannel`).
// Storybook loads this module, no one else: its imports of Storybook's are static.
import path from "node:path";
import type { Channel } from "storybook/internal/channels";
import { STORY_INDEX_INVALIDATED } from "storybook/internal/core-events";
import type { StoryIndexGenerator } from "storybook/internal/core-server";
import type { Options } from "storybook/internal/types";
import { slash } from "../../utils/slash.ts";
import { createStorybookPlugin } from "../storybookPlugin.ts";
import { ownModule } from "../utils/ownModule.ts";
import { featureIndexer, type Indexer } from "./preset/indexer.ts";
import { storybookPreviewPlugin } from "./preset/previewPlugin.ts";
import { type PresetOptions, projectOf } from "./preset/project.ts";

/** A file's import path in Storybook's index: from its working directory, with `./` (its `toImportPath`). */
const importPathOf = (file: string) => {
  const relative = slash(path.relative(process.cwd(), file));
  return relative.startsWith(".") ? relative : `./${relative}`;
};

/**
 * `storybook dev`'s server channel, as Storybook starts: from then on Storybook's index is told
 * of the feature files whose entries are out of date (their stories file or the Storybook steps
 * changed: `./preset/devWatch.ts`), as its own watcher tells it of a changed file: each file's
 * entry invalidated in the index generator (the one the server reads: a preset's
 * `storyIndexGenerator`, as the Vitest addon's preset gets it), then the channel's event that
 * has the browser fetch the index again. Nothing on disk. Not documented API: checked on every
 * Storybook update (`e2e/storybookDev.feature`'s title scenario).
 */
export const experimental_serverChannel = async (
  channel: Channel,
  options: Options,
) => {
  projectOf(options).onIndexOutOfDate(async (features) => {
    const generator = await options.presets.apply<StoryIndexGenerator>(
      "storyIndexGenerator",
    );
    for (const feature of features) {
      generator.invalidate(importPathOf(feature), false);
    }
    channel.emit(STORY_INDEX_INVALIDATED);
  });
  return channel;
};

/**
 * Storybook's indexers, and ours for feature files first (`./preset/indexer.ts`).
 */
export const experimental_indexers = async (
  existing: Indexer[] = [],
  options: PresetOptions,
): Promise<Indexer[]> => [featureIndexer(options), ...existing];

/**
 * The page's annotation: its runner (in the preview, with cucumber's BeforeAll and AfterAll). Story
 * tests get their own (the addon's Vitest runs, `VITEST` set, as `viteFinal` reads it), Storybook's
 * own preview its own: each imports its runner, so neither page loads the other's.
 */
export const previewAnnotations = (entries: string[] = []) => [
  ...entries,
  ownModule(
    process.env.VITEST
      ? "worker/storybook/vitest/annotation"
      : "worker/storybook/preview/annotation",
  ),
];

/**
 * The Vite config's plugins: as Storybook serves or builds its preview, the preview plugin; in the
 * addon's Vitest runs (which add a preset's `viteFinal` plugins to the Storybook project), the
 * project's story tests' plugins, from Storybook's options (the addon entry's among them).
 */
export const viteFinal = async (
  config: { plugins?: unknown[] },
  options: PresetOptions,
) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.VITEST
      ? createStorybookPlugin(options)
      : [storybookPreviewPlugin(options)]),
  ],
});
