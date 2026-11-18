// The data a feature module hands the runtime: the feature file as plain data (written into the
// module by main), and the support files' import. Also the plugin's options and a run's options,
// which both sides share. The worker's host API: `./platform.ts`.
import type { IConfiguration } from "@cucumber/cucumber/api";
import type { GherkinDocument, Pickle } from "@cucumber/messages";

/**
 * The plugin's options: the cucumber options it supports (see cucumber's configuration docs), its
 * configuration.
 */
export type CucumberOptions = Partial<
  Pick<
    IConfiguration,
    | "import"
    | "dryRun"
    | "backtrace"
    | "language"
    | "strict"
    | "worldParameters"
  >
>;

/** A suite's or test's Gherkin location, for Vitest's `file:line` filters. */
interface Located {
  name: string;
  line: number;
  column: number;
}

/** A Vitest suite: a feature, a rule or a scenario outline. */
export interface FeatureSuite extends Located {
  children: (FeatureSuite | FeatureTest)[];
}

/** A Vitest test: a scenario or an example (one pickle; its line selects it in a run). */
export interface FeatureTest extends Located {
  /** The pickle's tags (including the feature's, rule's and examples'). */
  tags: string[];
}

/** The options a run follows: of cucumber's resolved configuration, what the runtime reads. */
export interface RunOptions {
  strict?: boolean;
  dryRun?: boolean;
  worldParameters?: unknown;
}

export interface Feature {
  /** The project's root, cucumber's `cwd`. */
  cwd: string;
  /** The file's path from `cwd`, with `/` (cucumber's `uri`). */
  uri: string;
  /** Its tests; the root is the feature (named by `uri` if it has no name). */
  featureTree: FeatureSuite;
  /** The run's options, from the user's configuration as cucumber resolved it in main. */
  options: RunOptions;
  /**
   * Its Gherkin document and pickles, as cucumber's Gherkin parser compiled them, which the worker or
   * the page runs (none if the file didn't parse).
   */
  gherkin: FeatureGherkin;
}

/** A feature file's Gherkin document and pickles (see `Feature.gherkin`). */
export interface FeatureGherkin {
  document: GherkinDocument;
  pickles: Pickle[];
}

/**
 * Imports the support files, in order. The imports are the feature module's own `import()`s, so
 * Vite knows it depends on them and reruns it when one changes.
 */
export type ImportSupport = () => Promise<void>;
