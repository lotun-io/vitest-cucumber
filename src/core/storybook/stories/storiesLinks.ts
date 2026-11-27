// Storybook: which feature file runs on which stories file, for every Storybook feature file asked
// for so far: the stories file a feature names, whether it exists or not (none: it names none, or
// it failed before its links were made). One map, read both ways: a stories file's features are
// the ones naming it (a loop over what's kept, no feature linked again). What it's for: a stories
// file's event leaves its features out of date (`./storybookPlans.ts`'s `onFileChange`), and the
// features map is written from the linked ones (`../preset/project.ts`). `onChange` is called as
// anything in it changes.

/** The stories links of a project. */
export const createStoriesLinks = (onChange: () => void = () => undefined) => {
  /** Each feature file: the stories file it names (none: it names none). */
  const storiesFiles = new Map<string, string | undefined>();

  return {
    /** Feature file `feature` names `storiesFile` (none: it names none), as it was just linked. */
    link: (feature: string, storiesFile?: string) => {
      if (
        storiesFiles.has(feature) &&
        storiesFiles.get(feature) === storiesFile
      ) {
        return;
      }
      storiesFiles.set(feature, storiesFile);
      onChange();
    },
    /** Forgets feature file `feature` (deleted). */
    unlink: (feature: string) => {
      if (storiesFiles.delete(feature)) {
        onChange();
      }
    },
    /** Whether feature file `feature` was asked for. */
    has: (feature: string) => storiesFiles.has(feature),
    /** The stories file feature file `feature` names (none: it names none, or it wasn't asked for). */
    storiesFileOf: (feature: string) => storiesFiles.get(feature),
    /** The feature files that name `storiesFile`. */
    featuresOf: (storiesFile: string): string[] =>
      [...storiesFiles].flatMap(([feature, its]) =>
        its === storiesFile ? [feature] : [],
      ),
    /** Every feature file asked for. */
    features: (): string[] => [...storiesFiles.keys()],
    /** The feature files that name a stories file, each with it. */
    linked: (): [feature: string, storiesFile: string][] =>
      [...storiesFiles].flatMap(([feature, storiesFile]) =>
        storiesFile === undefined ? [] : [[feature, storiesFile]],
      ),
    /** Forgets everything. */
    clear: () => {
      storiesFiles.clear();
    },
  };
};

/** A project's stories links (`createStoriesLinks`). */
export type StoriesLinks = ReturnType<typeof createStoriesLinks>;
