// The parts node mode's and browser mode's plugins share (in Vitest's main process). Every feature
// file becomes a Vitest test module with a test per scenario, its plan made from its Gherkin as
// cucumber parses it (`../feature/plan.ts`).
// Vitest does all the reporting: cucumber writes nothing.
import path from "node:path";
import type { ViteUserConfig as UserConfig } from "vitest/config";
import type {
  TestProject,
  TestSpecification,
  VitestPluginContext,
} from "vitest/node";
import type { CucumberOptions } from "../../types/feature.ts";
import { slash } from "../../utils/slash.ts";
import { createCommands } from "../commands/commands.ts";
import { featureOfTestFile, isFeatureFile } from "../feature/featureFile.ts";
import { featureModule } from "../feature/featureModule.ts";
import {
  createFeaturePlans,
  type FailedPlan,
  type FileChange,
  type TagsPlan,
} from "../feature/plans.ts";
import type { PlannedFeature } from "../runs/runStart.ts";
import { testRunsOf, type ProjectSource } from "../runs/testRuns.ts";
import { withoutQuery } from "../utils/withoutQuery.ts";
import { colorsOf } from "./colors.ts";
import { cucumberVersion } from "./cucumberVersion.ts";
import { featureFilesOf } from "./featureFiles.ts";
import { frameFilterOf, internalDirectories } from "./frames.ts";
import { configurationOf } from "./options.ts";
import { declareTags } from "./tags.ts";
import { createVitestState } from "./vitestState.ts";
import { watchVitest } from "./vitestWatcher.ts";
import { createWatchReruns } from "./watchReruns.ts";

/**
 * What a file's event leaves for a watching Vitest to do, as the plans say (`createPlugin`'s
 * `watchWith`): whether the support files' list is another, and the feature files to take as
 * changed (Storybook's plans': their stories modules are made from more than their own text).
 */
type FileChangeAnswer = (
  type: FileChange,
  file: string,
) => Promise<{
  supportFilesChanged: boolean;
  staleFeatures?: readonly string[];
}>;

/**
 * The shared hooks, which each mode's plugin calls from its own, plus what the modes need from them
 * (`root`, `featurePlans`, …), with the user's options (`given`: `import` required, the others
 * cucumber's defaults where none; a missing or wrong one throws here, as the plugin is made). `platform` is the path of the mode's `Platform`
 * module, which every feature module imports; feature modules carry the file's Gherkin document and
 * pickles, which the plugin's runtime runs (`../../worker/runner/`).
 */
export const createPlugin = (
  given: Partial<CucumberOptions>,
  {
    platform,
    commandServer = false,
  }: {
    /** The mode's platform module, which its feature modules import. */
    platform: string;
    /** Whether its workers reach main through the commands' TCP server (node mode's). */
    commandServer?: boolean;
  },
) => {
  let root = process.cwd();
  /** The user's configuration: their options, with cucumber's defaults. */
  const configuration = configurationOf(given);
  /** What main knows of each feature file: its tags, its plan (`../feature/plans.ts`). */
  const plans = createFeaturePlans({ root: () => root, configuration });
  /** A watching Vitest: how feature files' modules are made again (`./watchReruns.ts`). */
  const reruns = createWatchReruns(() => vitestState.current());
  /**
   * The plans a file's event is told to: the feature plans, or the ones a plugin built on this
   * one puts on them (`watchWith`: Storybook's, which tell the feature plans themselves).
   */
  let onFileChange: FileChangeAnswer = plans.onFileChange;
  /**
   * Feature files' Gherkin tags as the Vitest tags declared (`./tags.ts`): all of them, or the ones a
   * plugin built on this one keeps (`declaredTagsWith`: Storybook's, every tag its tests may have).
   */
  let declaredTagsOf = (tags: readonly string[]): Promise<readonly string[]> =>
    Promise.resolve(tags);
  /**
   * The Vitest the plugin serves and its projects there, while it's open (`./vitestState.ts`): a
   * watching one's file changes listened to as it opens (`./vitestWatcher.ts`), what was read
   * for its plans dropped as it closes.
   */
  const vitestState = createVitestState({
    opened: (vitest) => {
      watchVitest(vitest, (type, file) => {
        fileChanged(type, file).catch((error: unknown) => {
          vitest.logger.error(error);
        });
      });
    },
    closed: () => {
      plans.cache.dispose();
    },
  });
  /** Whether a Vitest set up a project with this plugin (`configureVitest`, which only Vitest calls). */
  const inVitest = () => vitestState.current() !== undefined;
  /** The commands from the workers and pages to main (`../commands/commands.ts`). */
  const commands = createCommands({ cwd: () => root });
  /**
   * A file of a watching Vitest was added, changed or deleted: the plans are told
   * (`../feature/plans.ts`'s `onFileChange`, or Storybook's on them); the support files' list
   * another, every feature file is rerun (their modules import the old one); then the feature
   * files the plans say are out of date.
   */
  const fileChanged = async (type: FileChange, file: string) => {
    const { supportFilesChanged, staleFeatures = [] } = await onFileChange(
      type,
      file,
    );
    if (supportFilesChanged) {
      await reruns.everyFeature();
    }
    staleFeatures.forEach(reruns.feature);
  };
  /** A feature file's tags (one that can't be used: none). */
  const tagsOf = (plan: TagsPlan | FailedPlan) =>
    "error" in plan ? [] : plan.tags;
  /**
   * Declares the Gherkin tags of every feature file of `project` (`./tags.ts`), each read for its
   * tags alone, as the project is set up: before anything starts its workers, a run or a collect
   * (`vitest list`, `vitest.collect()`: no run start), and whatever files a run has (a tag
   * filter may name a tag of a file outside it).
   */
  const declareProjectTags = async (project: TestProject) => {
    const features = await featureFilesOf(project);
    // One that can't be read: no tags.
    const read = await Promise.all(features.map(plans.tagsPlanOf));
    declareTags(project, await declaredTagsOf(read.flatMap(tagsOf)));
  };

  /**
   * The plugin's part of a run's start (the test runs' reporter calls it with its projects' test
   * files, before Vitest starts the run's workers: `../runs/testRuns.ts`): the feature files it
   * planned (the run's stream's opening: `../runs/runStart.ts`), their tags declared on their
   * projects (a file changed or added since the project was set up is in its run).
   */
  const runStart = async (
    specifications: readonly TestSpecification[],
  ): Promise<PlannedFeature[]> => {
    // A new run reads the disk: whatever was read for the last one is dropped, and each thing is
    // read once for all this run's files (their modules' transforms too). Nothing else says what
    // changed without a watcher (a Vitest run again through its API).
    plans.cache.clear();
    const features = await Promise.all(
      specifications.map(async ({ project, moduleId }) => {
        // A feature file (in a Storybook project, its stories module: its scenarios' story tests have
        // its tags).
        const feature = featureOfTestFile(moduleId);
        if (!feature) {
          return [];
        }
        // Its modules are made again for this run, as its plan is: whatever they were made from
        // (a Storybook feature's stories file, the support files) may be another, and nothing
        // said so where no watcher of the plugin's listens (the addon's Vitest: probed
        // 2026-11-18, a run used a module made before its stories changed).
        project.vitest.invalidateFile(feature);
        // A file that can't be used has no tags, and of the run's messages its source alone
        // (`../runs/runStart.ts`): its module throws its error as it runs
        // (`../feature/featureModule.ts`).
        // Its plan, and its text for the run's messages (its source), from the one reading. One
        // that can't be read: its plan has the error.
        const read = await plans.fileOf(feature).catch(() => undefined);
        const plan = await plans.vitestPlanOf(feature);
        const uri = slash(path.relative(root, feature));
        return [{ project, feature, uri, plan, content: read?.content ?? "" }];
      }),
    );
    const planned = features.flat();
    for (const { project, plan } of planned) {
      declareTags(project, await declaredTagsOf(tagsOf(plan)));
    }
    return planned;
  };

  /** The plugin, as Vitest's test runs know it (`../runs/testRuns.ts`): the same for all its projects. */
  const source: ProjectSource = { runStart };

  /**
   * What `project`'s workers get from main (see `../../types/providedContext.ts`); `command` its
   * commands' (`commands.providedFor`).
   */
  const providedOf = (
    project: TestProject,
    command: { port: number; token: string },
    colors: boolean,
  ) => ({
    command,
    colors,
    totalWorkers: project.config.maxWorkers,
    isolate: project.config.isolate,
    version: cucumberVersion,
    testTimeout: project.config.testTimeout,
    hookTimeout: project.config.hookTimeout,
    internalDirectories,
    projectName: project.name,
    // Set as each run starts (`../runs/testRuns.ts`).
    sendMessages: false,
    // The user's tag definitions with a timeout (the Gherkin tags the plugin declares have none).
    timedTags: (project.config.tags ?? [])
      .filter(({ timeout }) => timeout !== undefined)
      .map(({ name }) => name),
  });

  return {
    /** The project's root, cucumber's `cwd`. */
    root: () => root,
    /** The feature files' plans (see `../feature/plans.ts`). */
    featurePlans: plans,
    /** The support files' globs (the `import` option), from the project's root. */
    supportGlobs: configuration.import,
    /**
     * For a plugin built on this one (Storybook's: `../storybookPlugin.ts`): each file a watching
     * Vitest reports goes to its plans' `onFileChange` (`answer`, which tells the feature plans
     * itself), and what it says is out of date is rerun.
     */
    watchWith: (answer: FileChangeAnswer) => {
      onFileChange = answer;
    },
    /**
     * For a plugin built on this one whose tests have only some of their Gherkin tags (Storybook's:
     * not Storybook's, `../storybook/stories/storybookTags.ts`): the tags declared are the ones
     * `keep` gives, every one its tests may have.
     */
    declaredTagsWith: (
      keep: (tags: readonly string[]) => Promise<readonly string[]>,
    ) => {
      declaredTagsOf = keep;
    },
    /** The commands (`../commands/commands.ts`): their browser command, what workers get. */
    commands,
    /** The shared part of the plugin's config (each mode adds its own). */
    config: (userConfig: UserConfig): UserConfig => ({
      test: {
        // Set here, before Vitest resolves the config, because the browser server copies it then.
        // Filtering unless `backtrace`.
        onStackTrace: frameFilterOf(
          userConfig.test?.onStackTrace,
          !configuration.backtrace,
        ),
        // Every run's tests located (Vitest does it only for `file:line` filters otherwise): a
        // feature module's calls, through its map, at their Gherkin lines
        // (`../feature/featureModule.ts`), so each failure's header names its line.
        includeTaskLocation: true,
      },
    }),
    configResolved: (config: { root: string }) => {
      root = config.root;
    },
    configureVitest: async ({
      vitest,
      project,
      defineCacheKeyGenerator,
    }: VitestPluginContext) => {
      vitestState.add(vitest, project);
      testRunsOf(vitest).register(project, source);
      await declareProjectTags(project);

      // A feature module contains the plugin's options and support files, not just the file's
      // content, so Vitest's file system cache must not keep it (a Storybook one's id has a query).
      defineCacheKeyGenerator(({ id }) =>
        isFeatureFile(withoutQuery(id)) ? false : undefined,
      );
      // What the project's workers and pages get from main: node mode's reach it through the
      // commands' TCP server (started with its first project), a page through its browser command.
      project.provide(
        "vitestCucumber",
        providedOf(
          project,
          await commands.providedFor(commandServer ? vitest : undefined),
          colorsOf(vitest),
        ),
      );
    },
    /**
     * Turns a feature file into its test module (from its plan, not the code given). A Storybook
     * project's plugins don't use it: there it's its stories module (`../storybookPlugin.ts`).
     */
    transform: async (_code: string, id: string) => {
      // Only Vitest runs a feature module: elsewhere (Storybook's builder, which runs a Vite
      // config's root plugins too) it's left as it is, a Storybook preview's being the preset's to
      // make (`../storybook/preset/previewPlugin.ts`).
      if (!isFeatureFile(id) || !inVitest()) {
        return undefined;
      }
      const { code, map } = featureModule({
        platform,
        cwd: root,
        file: id,
        plan: await plans.vitestPlanOf(id),
      });
      return {
        code,
        // Its calls each mapped to its Gherkin line, every other line unmapped (`../feature/featureModule.ts`).
        // A failed file's: a one-line map. An error's first frame points at a step's line in the
        // feature file (see `../../worker/platform/errors/testErrors.ts`); with no mapping for it,
        // Vitest keeps it as it is. Without a map, Vitest would map it through the generated code
        // instead and get the line wrong.
        map: map ?? { version: 3, sources: [id], names: [], mappings: "AAAA" },
      };
    },
  };
};
