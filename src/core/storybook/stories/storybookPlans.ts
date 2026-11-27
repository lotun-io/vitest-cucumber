// Storybook: what main knows of each feature file a Storybook project lists as stories, built on
// its feature plans (`../../feature/plans.ts`) from what they give any caller: a feature's Vitest
// plan, its text, the support files.
// - `storybookPlanOf`: its Vitest plan and its stories module, linked by the support files'
//   Storybook steps to its stories file and each scenario's story, its title its stories file's
//   (`./storybookPlan.ts`; a stories file that writes none: Storybook's automatic one, which the
//   host gives, `autoTitleOf`);
// - `storybookIndexPlanOf`: its Storybook plan and its index entries (`./indexEntries.ts`);
// - `storybookSupportPlanOf`: what the project's support code is loaded with, the same for every
//   feature file.
// None throws: a feature that can't be linked has a `FailedPlan`, as one that can't be parsed.
//
// Its parts are cached with the feature plans' (`plans.cache`, `../../feature/planCache.ts`: one
// `clear()` for both): the Storybook steps (the support files' text) and each stories file's
// stories. A plan is put together at each ask.
// Kept across `clear()`: which feature runs on which stories file, both ways (`links`,
// `./storiesLinks.ts`: a watcher's events are looked up in them, and the host's features map
// is written from them, `onLinkedFeaturesChanged` as they change).
//
// A file event of a watching host (`onFileChange`: the one call a host makes, the feature plans
// told first here, so their answers are fresh): each part that may be another is made again and
// compared with the one last made (`changed`), so a file saved as it was, or only touched,
// changes nothing. What it gives back is what's left for the host to do: the feature plans'
// answer (whether the support files' list is another), the feature files to take as changed
// (their stories module is made from their stories file and the Storybook steps too, which
// nothing else follows: `onFileChange`). What shows a feature's text (`storybook dev`'s
// features map) is its host's to follow: it's made again and compared there
// (`../preset/featuresModule.ts`).
// One ask doesn't wait for the host: Storybook's indexer's, which its own watcher may bring
// before the file's event, so its feature file is taken as changed first.
//
// Two feature files on one stories file with the same label (`Feature: Login`) would share their
// title and ids in Storybook: refused (the user's call, 2026-11-20), the feature's link error
// naming the other, checked against the features on its stories file linked so far (Storybook's
// index links every one; a run of some files sees theirs). A feature's label is kept as its plan
// was made with: at an event, another label, or a feature deleted, has the others on its stories
// file made again (the error is theirs to drop, or to have).
import { existsSync } from "node:fs";
import type { RunOptions } from "../../../types/feature.ts";
import { slash } from "../../../utils/slash.ts";
import { isFeatureFile } from "../../feature/featureFile.ts";
import {
  failedPlan,
  type FailedPlan,
  type FeaturePlans,
  type FileChange,
  type VitestPlan,
} from "../../feature/plans.ts";
import { featureLinksOf } from "./featureLinks.ts";
import { featureLabelOf } from "./featureStories.ts";
import {
  indexEntriesOf,
  type IndexInput,
  type MakeTitle,
} from "./indexEntries.ts";
import type { SameLabel } from "./linkedFeature.ts";
import {
  dropStoriesFile,
  readStoriesFile,
  type StoriesOf,
} from "./storiesFile.ts";
import { createStoriesLinks } from "./storiesLinks.ts";
import type { AutoTitleOf } from "./storiesTitle.ts";
import { storybookPlanFrom } from "./storybookPlan.ts";
import { dropSupportFile, storybookStepsOfFiles } from "./supportSteps.ts";

/** What a project's support code is loaded with: every feature file's the same. */
export interface StorybookSupportPlan {
  /** The run's options, from the user's configuration. */
  options: RunOptions;
  /** The support files, in order. */
  supportFiles: string[];
}

/** A feature file made for Storybook: its Vitest plan, its stories module. */
export interface StorybookPlan extends VitestPlan {
  /** Its stories module: its code, its title (its stories file's, then its label), each story's own title by export. */
  stories: {
    code: string;
    title: string;
    titles: Record<string, string>;
  };
}

/** A feature file indexed for Storybook: its Storybook plan, and its index entries. */
export interface StorybookIndexPlan extends StorybookPlan {
  /** Its index entries (`./indexEntries.ts`). */
  indexEntries: IndexInput[];
}

/** What a file's event leaves for a Storybook host to do. */
export interface StorybookFileChanged {
  /** Whether the support files' list is another (the feature plans' answer): what was made with the old one is out of date. */
  supportFilesChanged: boolean;
  /** The feature files to take as changed, so their modules are made again. */
  staleFeatures: string[];
}

/**
 * The Storybook plans of the project at `root`, on its feature `plans` (the run's options
 * theirs), with Storybook's automatic titles (`autoTitleOf`).
 */
export const createStorybookPlans = ({
  plans,
  root,
  autoTitleOf,
  onLinkedFeaturesChanged = () => undefined,
}: {
  plans: Pick<
    FeaturePlans,
    "vitestPlanOf" | "supportFiles" | "options" | "onFileChange" | "cache"
  >;
  root: () => string;
  /** Storybook's automatic title of a stories file (`./storiesTitle.ts`): the host knows its `stories`. */
  autoTitleOf: AutoTitleOf;
  /**
   * Which feature file runs on which stories file changed (`links`): the host makes again what
   * it wrote from them (`storybook dev`'s features map). They change as a plan is made, not
   * only at a file's event.
   */
  onLinkedFeaturesChanged?: () => void;
}) => {
  type StoriesFile = Awaited<ReturnType<typeof readStoriesFile>>;

  // The parts, as read from disk.
  /** The Storybook steps of the support files (each file read). */
  const steps = plans.cache.single({
    make: async () => storybookStepsOfFiles(await plans.supportFiles()),
    same: (a, b) => a.expressions.join("\n") === b.expressions.join("\n"),
  });
  const stories = plans.cache.of<StoriesFile>({
    same: (a, b) => a.content === b.content,
  });
  /** Which feature file runs on which stories file, both ways (their paths with `/`). */
  const links = plans.cache.keep(createStoriesLinks(onLinkedFeaturesChanged));
  /**
   * Each Storybook feature file's label (`Feature: <name>`), as it was first read: kept until the
   * file's own event (`onFileChange`, which compares it) or the cache's clearing.
   */
  const labels = plans.cache.of<string>();

  /** Reads feature file `file`'s label (its plan's error, if it fails). */
  const readLabel = (file: string) => async () => {
    const plan = await plans.vitestPlanOf(file);
    if ("error" in plan) {
      throw plan.error;
    }
    return featureLabelOf(plan.gherkin.document, file);
  };
  /** The other feature files on feature file `feature`'s stories file (with `/`), as linked so far. */
  const othersOf = (feature: string) => {
    const storiesFile = links.storiesFileOf(feature);
    return storiesFile === undefined
      ? []
      : links.featuresOf(storiesFile).filter((other) => other !== feature);
  };
  /**
   * The other feature files on `feature`'s stories file whose labels have its `label`'s id (one
   * title before both: Storybook's `sanitize`, case and punctuation dropped), by path (one
   * failing: none).
   */
  const sameLabelOf = async (
    feature: string,
    label: string,
  ): Promise<SameLabel[]> => {
    const { sanitize } = await import("storybook/internal/csf");
    const others = othersOf(feature);
    const theirs = await Promise.all(
      others.map((other) =>
        labels(other, readLabel(other)).catch(() => undefined),
      ),
    );
    const id = sanitize(label);
    return others
      .flatMap((file, index) => {
        const other = theirs[index];
        return other !== undefined && sanitize(other) === id
          ? [{ file, label: other }]
          : [];
      })
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  };

  /** Stories file `file`'s stories, as Storybook reads them. */
  const storiesOf = async (file: string): Promise<StoriesOf> =>
    (await stories(slash(file), () => readStoriesFile(slash(file)))).stories;

  /**
   * Feature file `file`'s Storybook plan, put together: its Vitest plan, linked by the support
   * files' Storybook steps (its stories file noted), its stories module.
   */
  const makeStorybookPlan = async (
    file: string,
  ): Promise<StorybookPlan | FailedPlan> => {
    const plan = await plans.vitestPlanOf(file);
    if ("error" in plan) {
      links.link(slash(file));
      return plan;
    }
    const by = await steps();
    const linked = featureLinksOf({
      feature: file,
      uri: plan.uri,
      root: root(),
      steps: by,
      ...plan.gherkin,
    });
    // The stories file it names, whether it exists or not: an event of that file concerns it.
    links.link(
      slash(file),
      linked.named === undefined ? undefined : slash(linked.named),
    );
    const label = featureLabelOf(plan.gherkin.document, file);
    await labels(slash(file), async () => label);
    return storybookPlanFrom({
      feature: file,
      plan,
      linked,
      label,
      sameLabel: await sameLabelOf(slash(file), label),
      stepErrors: by.errors,
      root: root(),
      storiesOf,
      autoTitleOf,
    });
  };
  const storybookOf = (file: string) =>
    makeStorybookPlan(file).catch(failedPlan);

  return {
    /** Feature file `file` made for Storybook: its stories module, or what stops it. */
    storybookPlanOf: (file: string): Promise<StorybookPlan | FailedPlan> =>
      storybookOf(file),
    /**
     * Feature file `file` indexed for Storybook: its Storybook plan and its index entries, with
     * `makeTitle` (Storybook's, as it gives it to its indexer). Storybook indexes a changed
     * feature file by its own watcher, which nothing orders with the host's: this ask may come
     * before the file's event. So the feature plans take the file as changed first (Storybook
     * asks once, and again only as the file changes).
     */
    storybookIndexPlanOf: async (
      file: string,
      makeTitle: MakeTitle,
    ): Promise<StorybookIndexPlan | FailedPlan> => {
      try {
        await plans.onFileChange("change", file);
        const plan = await storybookOf(file);
        return "error" in plan
          ? plan
          : {
              ...plan,
              indexEntries: await indexEntriesOf({
                fileName: file,
                stories: plan.stories,
                makeTitle,
              }),
            };
      } catch (error) {
        return failedPlan(error);
      }
    },
    /**
     * What the project's support code is loaded with (Storybook's preview's support module:
     * `../preset/supportModule.ts`), or why it can't be (the support files can't be listed).
     */
    storybookSupportPlanOf: async (): Promise<
      StorybookSupportPlan | FailedPlan
    > => {
      try {
        return {
          options: plans.options,
          supportFiles: await plans.supportFiles(),
        };
      } catch (error) {
        return failedPlan(error);
      }
    },
    /**
     * The host's watcher reports `file` added, changed or deleted (`type`): the feature plans
     * are told first, here (`supportFilesChanged` is their answer). By what the file is:
     * - a feature file: deleted, it's forgotten, the others on its stories file in `staleFeatures`;
     *   else the others on its stories file are in `staleFeatures` if its label is another (a
     *   same label is refused).
     * - a stories file a feature names (whether it exists or not): changed with another text,
     *   added or deleted, the features naming it are in `staleFeatures`.
     * - a support file (whatever its event: an editor may save one as a delete, then an add),
     *   or the support files' list another: the Storybook steps are read again; their
     *   expressions others, every Storybook feature file is in `staleFeatures`.
     */
    onFileChange: async (
      type: FileChange,
      file: string,
    ): Promise<StorybookFileChanged> => {
      const { supportFilesChanged } = await plans.onFileChange(type, file);
      const id = slash(file);
      if (isFeatureFile(id)) {
        const others = othersOf(id);
        if (type === "unlink") {
          links.unlink(id);
          labels.drop(id);
          return { supportFilesChanged, staleFeatures: others };
        }
        const labelChanged = await labels.changed(id, readLabel(id));
        return {
          supportFilesChanged,
          staleFeatures: labelChanged ? others : [],
        };
      }
      // A stories file a feature names (whether it exists or not): read again as it changes.
      // Any other file: what's kept of it (a stories file no feature names now) dropped.
      const named = links.featuresOf(id).length > 0;
      let storiesChanged = named;
      if (named && type === "change") {
        storiesChanged = await stories.changed(id, () => readStoriesFile(id));
      } else {
        stories.drop(id);
      }
      if (type === "unlink") {
        dropStoriesFile(id);
        dropSupportFile(id);
      }
      const stepsChanged =
        (supportFilesChanged || (await plans.supportFiles()).includes(id)) &&
        (await steps.changed());
      // Out of date (a feature's module is made from its stories file and the Storybook steps
      // too, which Vite, Vitest and Storybook don't know): every Storybook feature if the steps'
      // expressions are others (any may link another way), else the features naming the file.
      const stale = stepsChanged
        ? links.features()
        : storiesChanged
          ? links.featuresOf(id)
          : [];
      // Deleted since: forgotten, its host's own to drop.
      for (const feature of stale.filter((feature) => !existsSync(feature))) {
        links.unlink(feature);
      }
      return { supportFilesChanged, staleFeatures: stale.filter(links.has) };
    },
    /** Which Storybook feature file runs on which stories file, both ways: the features map's. */
    links,
  };
};

/** A project's Storybook plans (`createStorybookPlans`). */
export type StorybookPlans = ReturnType<typeof createStorybookPlans>;
