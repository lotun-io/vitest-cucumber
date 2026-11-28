// What main knows of each feature file, in every mode: its plans.
// - `tagsPlanOf`: its Gherkin tags (every feature file of a project: `../plugin/tags.ts`), read
//   by cucumber's parser for them alone (a quarter of a millisecond; its full plan seven times that);
// - `vitestPlanOf`: its parse (`./plan.ts`: its test tree, its Gherkin document and pickles) and
//   what its module is made with (the run's options, the support files): a file of a run (its
//   messages, its test module).
// Storybook's plans are built on these (`../storybook/stories/storybookPlans.ts`), from what
// these give any caller: nothing of Storybook is here.
// None throws: whatever goes wrong (the file doesn't parse or can't be read) is its plan's `error`
// (`FailedPlan`), and a failed feature file's module throws it where it runs (`./featureModule.ts`):
// one path for every error. The user's configuration is a value, made as the plugin is (a wrong
// option stops Vitest or Storybook as they start: `../plugin/options.ts`).
//
// The cache is the parts a plan is made of, never a plan (`cache`, `./planCache.ts`): a
// feature file's text and the support files' list, read at the first ask and the same from then
// on (a run of N feature files lists the support files once). A plan is put together from them
// at each ask, so none is ever out of date with its parts. What costs is cached by a file's text
// and never wrong (`../utils/fileCache.ts`: a feature file's tags and its parse).
// Only the host says when a part may be another on disk:
// - a Vitest run's start (`../plugin/createPlugin.ts`): `cache.clear()`, so every run reads the
//   disk once, whatever happened since the last one (nothing reports it without a watcher);
// - a file event of a watching host (`onFileChange`: a watching Vitest, `storybook dev`): a
//   feature file's text is dropped, and the support files are listed again as a file is added
//   or removed. What it gives back is what's left for the host to do.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  FeatureGherkin,
  FeatureSuite,
  RunOptions,
} from "../../types/feature.ts";
import {
  isPluginError,
  locatedError,
  pluginError,
} from "../../utils/errors.ts";
import { slash } from "../../utils/slash.ts";
import { runOptionsOf, type Configuration } from "../plugin/options.ts";
import { supportFilesOf } from "../support/supportFiles.ts";
import { fileCache } from "../utils/fileCache.ts";
import { isFeatureFile } from "./featureFile.ts";
import { tagsOf, tagsOfDocument } from "./featureTags.ts";
import { parseErrorOf } from "./parseErrors.ts";
import { planOf } from "./plan.ts";
import { createPlanCache } from "./planCache.ts";

/** A feature file of a project: its Gherkin tags. */
export interface TagsPlan {
  /** Its path from the root, with `/`. */
  uri: string;
  /** Its Gherkin tags (`./featureTags.ts`). */
  tags: string[];
}

/** A feature file of a run: its parse, and what its module is made with besides. */
export interface VitestPlan extends TagsPlan {
  /** Its text, as it was parsed (its feature module is written from it: `./featureModule.ts`). */
  content: string;
  /** Its test tree, and its Gherkin document and pickles (`./plan.ts`). */
  featureTree: FeatureSuite;
  gherkin: FeatureGherkin;
  /** The run's options, from the user's configuration. */
  options: RunOptions;
  /** The support files, in order. */
  supportFiles: string[];
}

/** How a file changed, as a watcher names it (`onFileChange`'s). */
export type FileChange = "add" | "change" | "unlink";

/** A feature file that can't be used: why. */
export interface FailedPlan {
  error: Error;
}

/** A feature file parsed: the part of its plans its text alone decides. */
type Parsed = Pick<VitestPlan, "uri" | "tags" | "featureTree" | "gherkin">;

/**
 * A failed plan for `error`: whatever stopped a file from having a plan. The plugin's own errors
 * as they are (the file's: it can't be parsed, read, linked); anything else is the plugin's bug,
 * the error its cause.
 */
export const failedPlan = (error: unknown): FailedPlan => ({
  error: isPluginError(error)
    ? error
    : pluginError("a feature file's plan couldn't be made", {
        internal: true,
        cause: error,
      }),
});

/** The feature plans of the project at `root`, with the user's `configuration` (their options, with cucumber's defaults). */
export const createFeaturePlans = ({
  root,
  configuration,
}: {
  root: () => string;
  configuration: Configuration;
}) => {
  const cache = createPlanCache();
  /** The run's options, from the configuration. */
  const options = runOptionsOf(configuration);

  /** Feature file `file` as it is on disk: its text and its uri; it can't be read: its error. */
  const read = async (file: string) => {
    const uri = slash(path.relative(root(), file));
    try {
      return { content: await readFile(file, "utf8"), uri };
    } catch (error) {
      // Node's reason, without the path it names (absolute: the place says it).
      const reason = (
        error instanceof Error ? error.message : String(error)
      ).replace(/, \w+ '[^']*'$/, "");
      throw locatedError(`feature file can't be read (${reason})`, [uri]);
    }
  };
  type FeatureFile = Awaited<ReturnType<typeof read>>;

  // The parts, as read from disk.
  const reads = cache.of<FeatureFile>();
  // What a feature file's text alone decides (`../utils/fileCache.ts`): not cleared.
  const tagsByText = cache.keep(fileCache<TagsPlan>());
  const parsedByText = cache.keep(fileCache<Parsed | FailedPlan>());

  /** Feature file `file`'s text and its uri. */
  const readOf = (file: string) => reads(slash(file), () => read(file));
  /** The support files' list. */
  const supportFiles = cache.single({
    make: async () => supportFilesOf(root(), configuration),
    same: (a, b) => a.join("\n") === b.join("\n"),
  });

  /** Feature file `file` (read as `{ content, uri }`) parsed, or why it can't be. */
  const parsedOf = (file: string, { content, uri }: FeatureFile) =>
    parsedByText(slash(file), content, (): Parsed | FailedPlan => {
      const { featureTree, parseErrors, gherkin } = planOf(
        content,
        uri,
        configuration.language,
      );
      return gherkin && parseErrors.length === 0
        ? { uri, tags: tagsOfDocument(gherkin.document), featureTree, gherkin }
        : {
            // The feature file's own error: no frame of main's would be the user's.
            error: parseErrorOf(uri, parseErrors),
          };
    });

  /** Feature file `file`'s Vitest plan, put together: its parse, the run's options, the support files. */
  const makeVitestPlan = async (
    file: string,
  ): Promise<VitestPlan | FailedPlan> => {
    const now = await readOf(file);
    const parsed = parsedOf(file, now);
    return "error" in parsed
      ? parsed
      : {
          ...parsed,
          content: now.content,
          options,
          supportFiles: await supportFiles(),
        };
  };

  return {
    /** Feature file `file` as read (its text, for a run's source message), as its plans are made with. */
    fileOf: readOf,
    /** Feature file `file`'s tags (parsed for them alone, once per text). */
    tagsPlanOf: (file: string): Promise<TagsPlan | FailedPlan> =>
      readOf(file).then(
        ({ content, uri }) =>
          tagsByText(slash(file), content, () => ({
            uri,
            tags: tagsOf(content, uri, configuration.language),
          })),
        failedPlan,
      ),
    /** Feature file `file` planned: its parse, the run's options, the support files. */
    vitestPlanOf: (file: string): Promise<VitestPlan | FailedPlan> =>
      makeVitestPlan(file).catch(failedPlan),
    /** The support files, in order. */
    supportFiles,
    /** The run's options, from the user's configuration: every plan's. */
    options,
    /**
     * The host's watcher reports `file` added, changed or deleted (`type`): the part read from
     * it is dropped, now (whatever asks next reads it again). A feature file: its text (deleted:
     * its tags and its parse too). A file added or removed: the support files are listed again,
     * and `supportFilesChanged` says whether the list is another, for the host to make again
     * what it made with the old one. A feature file's own change is its host's (it asks for its
     * plan again).
     */
    onFileChange: async (
      type: FileChange,
      file: string,
    ): Promise<{ supportFilesChanged: boolean }> => {
      const id = slash(file);
      if (isFeatureFile(id)) {
        reads.drop(id);
        if (type === "unlink") {
          tagsByText.drop(id);
          parsedByText.drop(id);
        }
        return { supportFilesChanged: false };
      }
      return {
        supportFilesChanged:
          type !== "change" && (await supportFiles.changed()),
      };
    },
    /**
     * The cache of the plans' parts: `clear()` at a run's start, `dispose()` as the plugin's
     * Vitest closes; plans built on these keep their own parts in it.
     */
    cache,
  };
};

/** A project's feature plans (`createFeaturePlans`). */
export type FeaturePlans = ReturnType<typeof createFeaturePlans>;
