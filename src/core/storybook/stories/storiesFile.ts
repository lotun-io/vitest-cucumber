// Storybook: a stories file's stories, read as Storybook reads them (`loadCsf`,
// `storybook/internal/csf-tools`, loaded only in Storybook projects: CSF 3; CSF factories are seen
// and refused where a feature links to them, `./linkedFeature.ts`), kept by the file's text
// (`../../utils/fileCache.ts`: its features, often several, each ask for them, and `loadCsf`
// parses it with Babel).
import { readFile } from "node:fs/promises";
import { loadCsf } from "storybook/internal/csf-tools";
import { Tag } from "storybook/preview-api";
import { fileCache } from "../../utils/fileCache.ts";

/**
 * A stories file's stories, as Storybook reads them: their exports, whether it's CSF factories, the
 * meta's literal title (none: Storybook's automatic one) and tags, each story's own tags.
 */
export interface StoriesOf {
  exports: string[];
  factories: boolean;
  title?: string;
  metaTags: string[];
  tags: Record<string, string[]>;
}

/** The title a stories file without a literal one is read with (Storybook's automatic one is the caller's). */
const untitled = "vitest-cucumber-untitled";

/** Each stories file's stories, by its text. */
const stories = fileCache<StoriesOf>();

/** Stories file `file` as it is on disk: its text, and its stories as Storybook's CSF parser reads them (`loadCsf`). */
export const readStoriesFile = async (file: string) => {
  const content = await readFile(file, "utf8");
  return {
    content,
    stories: stories(file, content, () =>
      storiesOfCsf(content, file, Tag.PLAY_FN),
    ),
  };
};

/** Stories file `file`'s stories. */
export const storiesOfFile = async (file: string): Promise<StoriesOf> =>
  (await readStoriesFile(file)).stories;

/** The stories of stories file `file` (its `content`), read by Storybook's parser. */
const storiesOfCsf = (
  content: string,
  file: string,
  playTag: string,
): StoriesOf => {
  const csf = loadCsf(content, {
    fileName: file,
    makeTitle: (title?: string) => title ?? untitled,
  }).parse();
  const inputs = csf.indexInputs;
  const metaTags = csf.meta?.tags ?? [];
  return {
    exports: inputs.map(({ exportName }) => exportName),
    factories: inputs.some(({ __stats }) => __stats?.factory === true),
    ...(csf.meta?.title !== undefined &&
      csf.meta.title !== untitled && { title: csf.meta.title }),
    metaTags,
    // An entry's tags: the meta's, the story's own, then `play-fn` (`playTag`: Storybook's
    // `Tag.PLAY_FN`) if it has a `play`.
    tags: Object.fromEntries(
      inputs.map(({ exportName, tags = [] }) => [
        exportName,
        tags.slice(metaTags.length).filter((tag) => tag !== playTag),
      ]),
    ),
  };
};

/** Drops what's kept of deleted stories file `file`. */
export const dropStoriesFile = (file: string) => {
  stories.drop(file);
};
