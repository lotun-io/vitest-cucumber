// Storybook: our indexer for feature files (the preset's `experimental_indexers`, first), in
// Storybook's own process and in the addon's Vitest, which loads presets too: Storybook builds its
// index there as well, once (its builder's Vite plugin asks for it as the project's config is
// resolved), and a docs page of a feature (`<Meta of={…}>` in an MDX file) needs the feature's
// entries, or the index fails and Vitest can't start: a broken one too (its own story alone).
import { loadCsf } from "storybook/internal/csf-tools";
import { brokenFeatureStories } from "../stories/featureStories.ts";
import type { IndexInput, MakeTitle } from "../stories/indexEntries.ts";
import { storybookTags } from "../stories/storybookTags.ts";
import { type PresetOptions, projectOf } from "./project.ts";

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
 * `storybook/internal/csf-tools`: each scenario's name, its tags, `play-fn`), its title the one its
 * module writes (the stories file's, then the feature's label). A broken feature file (it
 * doesn't parse, or its links can't be made) stops Storybook (dev or build) as a broken stories file
 * does: the indexer throws, Storybook lists the error (`MultipleIndexingError`). In the addon's Vitest
 * runs (`VITEST` set), where a thrown error would stop every project of the run, a broken feature
 * has its own story's entry alone instead, hidden (`brokenFeatureStories`: a docs page attached to
 * it, `<Meta of={…}>`, still finds it, or the index would fail on the page and Vitest not start):
 * only its story tests fail, with the error (its module's suite throws it: `storiesModule`), as a
 * broken feature file's tests do in node and browser mode.
 */
export const featureIndexer = (options: PresetOptions): Indexer => ({
  test: /\.feature(\.md)?$/,
  createIndex: async (fileName, { makeTitle }) => {
    const plan = await projectOf(options).storybookPlans.storybookIndexPlanOf(
      fileName,
      makeTitle,
    );
    if ("error" in plan) {
      if (!process.env.VITEST) {
        throw plan.error;
      }
      return loadCsf(brokenFeatureStories(storybookTags), {
        makeTitle,
        fileName,
      }).parse().indexInputs;
    }
    return plan.indexEntries;
  },
});
