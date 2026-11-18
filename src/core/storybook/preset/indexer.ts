// Storybook: our indexer for feature files (the preset's `experimental_indexers`, first), in
// Storybook's own process and in the addon's Vitest, which loads presets too: Storybook builds its
// index there as well, once (its builder's Vite plugin asks for it as the project's config is
// resolved), and a docs page of a feature (`<Meta of={…}>` in an MDX file) needs the feature's
// entries, or the index fails and Vitest can't start.
import type { IndexInput, MakeTitle } from "../stories/indexEntries.ts";
import { projectOf } from "./project.ts";

/** A Storybook indexer, as a preset's `experimental_indexers` gets and gives them. */
export interface Indexer {
  test: RegExp;
  createIndex: (
    fileName: string,
    options: { makeTitle: MakeTitle },
  ) => Promise<IndexInput[]>;
}

/**
 * Storybook's indexers, and ours for feature files (`.feature`, `.feature.md`, listed in Storybook's
 * `stories`): a feature file's stories module (`../stories/featureStories.ts`) indexed as Storybook's CSF
 * indexer does (`loadCsf(code, { makeTitle, fileName }).parse().indexInputs`,
 * `storybook/internal/csf-tools`: each scenario's name, its tags, `play-fn`), its title the stories
 * file's then the feature's label (a stories file without a literal title: Storybook's automatic one,
 * `makeTitle()`, which for a feature next to it is the stories file's). A broken feature file (it
 * doesn't parse, or its links can't be made) stops Storybook (dev or build) as a broken stories file
 * does: the indexer throws, Storybook lists the error (`MultipleIndexingError`). In the addon's Vitest
 * runs (`VITEST` set), where a thrown error would stop every project of the run, a broken feature
 * has no entries instead (the addon's test files are the `stories` globs' files, not the index's):
 * only its story tests fail, with the error (its module gives it: `storiesModule`), as a broken
 * feature file's tests do in node and browser mode.
 */
export const featureIndexer = (configDir: string): Indexer => ({
  test: /\.feature(\.md)?$/,
  createIndex: async (fileName, { makeTitle }) => {
    const plan = await projectOf(configDir).storybookPlans.storybookIndexPlanOf(
      fileName,
      makeTitle,
    );
    if ("error" in plan) {
      if (!process.env.VITEST) {
        throw plan.error;
      }
      return [];
    }
    // Its own copies: the plan keeps these, whatever Storybook does with what it's given.
    return structuredClone(plan.indexEntries);
  },
});
