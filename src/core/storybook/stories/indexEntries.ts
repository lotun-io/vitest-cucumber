// Storybook: a feature file's index entries, as Storybook's own CSF indexer reads a stories
// module: its generated stories module (`./featureStories.ts`) parsed by Storybook's parser
// (`loadCsf(code, { makeTitle, fileName }).parse().indexInputs`, `storybook/internal/csf-tools`:
// each scenario's name, its tags, `play-fn`). Its title is the stories file's then the feature's
// label; a stories file without a literal title: Storybook's automatic one (`makeTitle()`, which
// for a feature next to it is the stories file's), then the label. `makeTitle` is Storybook's,
// given to its indexer at each call: the entries' titles and their ids come from what it makes.

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

/** The index entries of feature file `fileName`'s stories module (`code`, its `title`, its `label`). */
export const indexEntriesOf = async ({
  fileName,
  stories: { code, title, label },
  makeTitle,
}: {
  fileName: string;
  stories: { code: string; title?: string; label: string };
  makeTitle: MakeTitle;
}): Promise<IndexInput[]> => {
  const { loadCsf } = await import("storybook/internal/csf-tools");
  const inputs: IndexInput[] = loadCsf(code, { makeTitle, fileName }).parse()
    .indexInputs;
  return title === undefined
    ? inputs.map((input) => ({
        ...input,
        title: `${input.title ?? makeTitle()}/${label}`,
      }))
    : inputs;
};
