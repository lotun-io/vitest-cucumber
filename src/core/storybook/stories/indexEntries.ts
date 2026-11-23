// Storybook: a feature file's index entries, as Storybook's own CSF indexer reads a stories
// module: its generated stories module (`./featureStories.ts`) parsed by Storybook's parser
// (`loadCsf(code, { makeTitle, fileName }).parse().indexInputs`, `storybook/internal/csf-tools`:
// each scenario's name, its tags, `play-fn`, the meta's `id` as `metaId`). Each entry's title is
// its story's own (its place in Vitest's tree: `titles`), given to `makeTitle`, Storybook's, as
// any written title is (it adds the `titlePrefix` of the feature file's `stories` pattern); their
// ids the meta's `id`'s, whatever their titles (the module writes one).

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
  stories: { code, title, titles },
  makeTitle,
}: {
  fileName: string;
  stories: { code: string; title: string; titles: Record<string, string> };
  makeTitle: MakeTitle;
}): Promise<IndexInput[]> => {
  const { loadCsf } = await import("storybook/internal/csf-tools");
  return loadCsf(code, { makeTitle, fileName })
    .parse()
    .indexInputs.map((input) => ({
      ...input,
      // Every export is a scenario's story, with its title (the module's: only for the type).
      title: makeTitle(titles[input.exportName] ?? title),
    }));
};
