// Storybook: a feature file's index entries, as Storybook's own CSF indexer reads a stories
// module: its generated stories module (`./featureStories.ts`) parsed by Storybook's parser
// (`loadCsf(code, { makeTitle, fileName }).parse().indexInputs`, `storybook/internal/csf-tools`:
// each scenario's name, its tags, `play-fn`). Its title is the one the module writes (its stories
// file's, then the feature's label), given to `makeTitle`, Storybook's, as any written title is
// (it adds the `titlePrefix` of the feature file's `stories` pattern): the entries' titles and
// their ids come from what it makes.

/** Storybook's function making a file's title, from the one written in it (none: its automatic one). */
export type MakeTitle = (title?: string) => string;

/** An index entry, as a Storybook indexer gives them (Storybook's `IndexInput`). */
export interface IndexInput {
  type: string;
  exportName: string;
  name?: string;
  title?: string;
  importPath?: string;
  tags?: string[];
  [key: string]: unknown;
}

/** The index entries of feature file `fileName`'s stories module (its `code`). */
export const indexEntriesOf = async ({
  fileName,
  stories: { code },
  makeTitle,
}: {
  fileName: string;
  stories: { code: string };
  makeTitle: MakeTitle;
}): Promise<IndexInput[]> => {
  const { loadCsf } = await import("storybook/internal/csf-tools");
  return loadCsf(code, { makeTitle, fileName }).parse().indexInputs;
};
