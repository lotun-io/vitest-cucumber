// Storybook: which feature file runs on which stories file, both ways, for every Storybook
// feature file asked for so far: a feature's stories file (none: it has none, or it failed before
// it was linked), and a stories file's features. The two sides are written only here, together
// (`link`, `unlink`), so they can't disagree. What it's for: a stories file's event leaves its
// features out of date (`./staleFeatures.ts`), and the features map is the second side written out
// (`../preset/project.ts`). `onChange` is called as anything in it changes.

/** The stories links of a project. */
export const createStoriesLinks = (onChange: () => void = () => undefined) => {
  /** Each feature file: the stories file it runs on (none: it has none). */
  const storiesFiles = new Map<string, string | undefined>();
  /** Each stories file: the feature files that run on it (under none: the ones that have none). */
  const features = new Map<string | undefined, Set<string>>();

  /** Takes `feature` out of both sides: whether it was there. */
  const remove = (feature: string) => {
    if (!storiesFiles.has(feature)) {
      return false;
    }
    const storiesFile = storiesFiles.get(feature);
    const its = features.get(storiesFile);
    its?.delete(feature);
    if (its?.size === 0) {
      features.delete(storiesFile);
    }
    storiesFiles.delete(feature);
    return true;
  };

  return {
    /** Feature file `feature` runs on `storiesFile` (none: it has none), as it was just linked. */
    link: (feature: string, storiesFile?: string) => {
      if (
        storiesFiles.has(feature) &&
        storiesFiles.get(feature) === storiesFile
      ) {
        return;
      }
      remove(feature);
      storiesFiles.set(feature, storiesFile);
      let its = features.get(storiesFile);
      if (!its) {
        its = new Set();
        features.set(storiesFile, its);
      }
      its.add(feature);
      onChange();
    },
    /** Forgets feature file `feature` (deleted). */
    unlink: (feature: string) => {
      if (remove(feature)) {
        onChange();
      }
    },
    /** Whether feature file `feature` was asked for. */
    has: (feature: string) => storiesFiles.has(feature),
    /** The stories file feature file `feature` runs on (none: it has none, or it wasn't asked for). */
    storiesFileOf: (feature: string) => storiesFiles.get(feature),
    /** The feature files that run on `storiesFile` (none: the ones that have none). */
    featuresOf: (storiesFile: string | undefined): string[] => [
      ...(features.get(storiesFile) ?? []),
    ],
    /** Every feature file asked for. */
    features: (): string[] => [...storiesFiles.keys()],
    /** Each stories file with its feature files (under none: the ones that have none). */
    storiesFiles: (): ReadonlyMap<string | undefined, ReadonlySet<string>> =>
      features,
    /** Forgets everything. */
    clear: () => {
      storiesFiles.clear();
      features.clear();
    },
  };
};

/** A project's stories links (`createStoriesLinks`). */
export type StoriesLinks = ReturnType<typeof createStoriesLinks>;
