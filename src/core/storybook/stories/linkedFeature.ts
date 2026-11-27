// Storybook: a feature file, linked to its stories file (`notes/storybook.md`, "The feature file as
// the CSF module"): its scenarios linked (`./featureLinks.ts`, by the support files' Storybook
// steps: `./supportSteps.ts`), each linked story checked here against the stories file's stories
// as Storybook reads them (`./storiesFile.ts`: CSF 3 only, CSF factories not yet supported), and
// its stories file's title taken: the one written in it, else Storybook's automatic one
// (`./storiesTitle.ts`); neither (no title written, no `stories` pattern matching the file), the
// feature has no title to be listed under. A feature file a Storybook project lists as stories
// must run on a stories file, and a label whose id no other feature on it has (two would share
// their stories' ids in Storybook: Storybook's ids ignore case and punctuation). The feature's module (its scenarios as stories, its stories
// file's meta, its title) is made from this, or it's stopped by every error in its links, which
// are the feature file's.
import path from "node:path";
import { slash } from "../../../utils/slash.ts";
import type { FeatureLinks, ScenarioLink } from "./featureLinks.ts";
import { type StoriesOf, storiesOfFile } from "./storiesFile.ts";
import type { AutoTitleOf } from "./storiesTitle.ts";

/** A feature file linked to its stories file, or every error that stops it. */
export type LinkedFeature =
  | {
      /** Its stories file, and its stories as Storybook reads them. */
      storiesFile: string;
      stories: StoriesOf;
      /** Its stories file's title (the one written, else Storybook's automatic one). */
      title: string;
      /** Its scenarios, each on its story. */
      links: ScenarioLink[];
    }
  | { errors: string[] };

/** Another feature file on the same stories file whose label gives the same id: its path, its label. */
export interface SameLabel {
  file: string;
  label: string;
}

/**
 * A linked feature file (`uri`, its path from `root`; `linked`, its links: `./featureLinks.ts`'s,
 * with the Storybook steps' own errors, `stepErrors`), checked against its stories file's stories
 * as Storybook reads them (`storiesOf`): its stories file, its stories, its title (the stories
 * file's own, else Storybook's automatic one, `autoTitleOf`) and the scenarios that run on them;
 * or every error in its links, these among them: it has no stories file, or another feature on
 * its stories file has a label with its `label`'s id (`sameLabel`: those that do, linked so far;
 * `idOf`, Storybook's `sanitize`: the error names the id).
 */
export const linkedFeatureOf = async ({
  uri,
  root,
  linked,
  stepErrors,
  label,
  sameLabel,
  autoTitleOf,
  storiesOf = storiesOfFile,
  idOf,
}: {
  uri: string;
  root: string;
  linked: FeatureLinks;
  stepErrors: readonly string[];
  /** The feature's label (`Feature: <name>`). */
  label: string;
  /** The other feature files on its stories file whose labels give its id (by path). */
  sameLabel: readonly SameLabel[];
  autoTitleOf: AutoTitleOf;
  storiesOf?: (file: string) => Promise<StoriesOf>;
  /** Storybook's `sanitize`: a title's id. */
  idOf: (title: string) => string;
}): Promise<LinkedFeature> => {
  const errors = [...stepErrors, ...linked.errors];
  const { storiesFile, links } = linked;
  if (!storiesFile) {
    // Its links' errors say why it has none (none named, one that doesn't exist, two).
    return { errors };
  }
  const storiesUri = slash(path.relative(root, storiesFile));
  /**
   * Its label's id taken on its stories file (titled `title`, if it has one): the last of its
   * errors, the id named (the other labels too, those written otherwise).
   */
  const takenOf = (title?: string) => {
    if (sameLabel.length === 0) {
      return [];
    }
    const others = sameLabel
      .map(({ file, label: theirs }) => {
        const other = slash(path.relative(root, file));
        return theirs === label ? other : `${other}: "${theirs}"`;
      })
      .join(", ");
    const id =
      title === undefined ? "" : `, the same id "${idOf(`${title}/${label}`)}"`;
    const why = sameLabel.some(({ label: theirs }) => theirs !== label)
      ? " (Storybook's ids ignore case and punctuation)"
      : "";
    return [
      `${uri}: ${storiesUri} already has a "${label}" (${others})${id}${why}: give one of them another name`,
    ];
  };
  /** Stopped: its links' errors, `more` of its stories file's, its label's. */
  const stopped = (
    title: string | undefined,
    ...more: string[]
  ): LinkedFeature => ({
    errors: [...errors, ...more, ...takenOf(title)],
  });
  /** Where the feature names its stories file: its stories file step's line. */
  const at = `${uri}:${String(linked.storiesLine)}`;
  // A file that isn't a stories file (a step naming a component, a folder), or a broken one: the
  // feature's error, not the reader's own (Storybook's parser's, Node's: no feature named).
  let stories;
  try {
    // With `/`: a reader writes the path it's given into its error (Storybook's parser, Node).
    stories = await storiesOf(slash(storiesFile));
  } catch (error) {
    // Its first line, its paths from the root (Storybook's parser and Node write them in full).
    const [reason = ""] = (
      error instanceof Error ? error.message : String(error)
    )
      .replaceAll(`${root}${path.sep}`, "")
      .replaceAll(`${slash(root)}/`, "")
      .split("\n");
    return stopped(
      undefined,
      `${at}: ${storiesUri} can't be read as a stories file (${reason})`,
    );
  }
  if (stories.factories) {
    return stopped(
      undefined,
      `${storiesUri} uses CSF factories, which the plugin doesn't support yet: ${uri}'s scenarios need its stories in CSF 3`,
    );
  }
  // The title its scenarios are listed under: the stories file's.
  const title = stories.title ?? (await autoTitleOf(slash(storiesFile)));
  const known = new Set(stories.exports);
  /** What its stories file lacks: a title, each story a scenario names. */
  const missing = [
    ...(title === undefined
      ? [
          `${at}: ${storiesUri} has no title: none is written in its meta, and no pattern of Storybook's "stories" matches it (give its meta a "title", or list the file in "stories")`,
        ]
      : []),
    ...links.flatMap(({ exportName, storyLine }) =>
      exportName !== undefined && !known.has(exportName)
        ? [
            `${uri}:${String(storyLine)}: ${storiesUri} has no story "${exportName}" (its stories: ${stories.exports.join(", ") || "none"})`,
          ]
        : [],
    ),
  ];
  if (
    title === undefined ||
    errors.length + missing.length + sameLabel.length > 0
  ) {
    return stopped(title, ...missing);
  }
  return { storiesFile, stories, title, links };
};
