// Where and how cucumber runs: a host's own pieces (`Host`: node mode's worker, browser mode's page,
// Storybook's story tests and its preview), the `Platform` every host gets from them
// (`../worker/platform/createPlatform.ts`), and what a run gives back (`Run`, the outcomes a test or
// a story shows). Page-safe.
import type { AssembledTestCase } from "@cucumber/core";
import type { GherkinDocument, Pickle } from "@cucumber/messages";
import type { Command } from "./commands.ts";
import type { ImportSupport, RunOptions } from "./feature.ts";
import type { Query } from "./query.ts";
import type { RuntimeEnvironment } from "./runtimeEnvironment.ts";
import type { SupportCall } from "./supportCode.ts";

/**
 * An annotation's arguments, as the test context's `annotate` takes them: a scenario's attachment,
 * log or link (`../worker/platform/scenario/annotations.ts`).
 */
export interface Annotation {
  message: string;
  type: string;
  attachment?: {
    contentType: string;
    body: string;
    bodyEncoding: "base64" | "utf-8";
  };
}

/**
 * A cucumber run's outcome: its success, and its messages (read into a `Query`), each failure's real
 * error on its message (`../worker/runner/failures.ts`).
 */
export interface Run {
  success: boolean;
  query: Query;
  /** A scenario's: whether cucumber would retry it (its worst status FAILED, attempts remaining). */
  willBeRetried?: boolean;
  /** A scenario's: the test case it ran (a retry runs it again). */
  testCase?: AssembledTestCase;
}

/** A stack frame's position: a step's line in its feature file, for Vitest's code frame of it. */
export interface StepFrame {
  file: string;
  line: number;
  column: number;
}

/**
 * A failure of a run, as the platform gives its host (`Host["throwable"]`): the value the user's
 * code threw (or the plugin's own error), and, for a scenario's step, the step's line in its feature
 * file, which the host adds to its stack as it sends it (`../worker/platform/errors/thrown.ts`).
 */
export interface Failure {
  value: unknown;
  frame?: StepFrame;
}

/** The BeforeAll or AfterAll hooks' outcome: passed, or failed with the error to report. */
export type HookOutcome = { passed: true } | { passed: false; error: unknown };

/**
 * A scenario's outcome, as its test presents it: its attachments, logs and links (in order), and
 * either nothing more (it passed), its skip (with a note: `../worker/platform/scenario/skipped.ts`), or the error to
 * report (with cucumber's summary for undefined, pending or ambiguous steps:
 * `../worker/platform/errors/testErrors.ts`).
 */
export interface ScenarioOutcome {
  annotations: Annotation[];
  skipped?: { note?: string };
  error?: { value: unknown };
}

/** A scenario to run: its pickle, of its feature file's Gherkin document. */
export interface ScenarioToRun {
  /** Its feature file's path from the project's root (the loaded run's `cwd`), with `/`. */
  uri: string;
  /** Its test's name (an error without its own text is named after it). */
  name: string;
  document: GherkinDocument;
  pickle: Pickle;
  /** Its attempt (Vitest's: `../worker/platform/scenario/attempts.ts`), and whether more remain. */
  attempt?: { attempt: number; moreAttemptsRemaining: boolean };
}

/** A run's project root (cucumber's `cwd`) and options, as the support code loads with them. */
export interface LoadRun {
  cwd: string;
  options: RunOptions;
  /**
   * Storybook's hosts: whether a support file has a Storybook step (main's scan:
   * `../core/storybook/stories/storybookSteps.ts`), so the host defines their parameter types
   * (`../worker/storybook/story.ts`). Never set in node and browser mode.
   */
  storybookSteps?: boolean;
}

/**
 * The `Platform`: what the runtime (`../worker/feature/runtime.ts`), the worker fixture and
 * Storybook's runners talk to, the same on every host (`../worker/platform/createPlatform.ts`).
 */
export interface Platform {
  /**
   * The support code to load, for `run`, through `importSupport` (a feature module's, as it's
   * imported; the first one's kept): nothing loaded yet, so collecting a test file (`vitest list`)
   * runs none of it.
   */
  use(run: LoadRun, importSupport: ImportSupport): void;
  /**
   * Loads the support code (`use`'s) as the worker's or page's first file runs, once (a later call
   * gets the same, its error too): it reads its worker's run (a worker or page lives within one),
   * sets cucumber's worker variables, imports the support code, and builds it with the run's ids,
   * its messages sent.
   */
  load(): Promise<void>;
  /** Runs the BeforeAll hooks. */
  beforeAll(): Promise<HookOutcome>;
  /** Runs the AfterAll hooks: their outcome, none if the support code failed to load (none ran). */
  afterAll(): Promise<HookOutcome | undefined>;
  /** Runs one scenario. */
  scenario(scenario: ScenarioToRun): Promise<ScenarioOutcome>;
}

/**
 * A worker's or page's place in its run: the cucumber worker id (`CUCUMBER_WORKER_ID`: a Vitest
 * host's pool id, `../worker/platform/vitest/vitestHost.ts`), how many workers run at once
 * (`CUCUMBER_TOTAL_WORKERS`: Vitest's `maxWorkers`), and its project's name (`""`: unnamed), which
 * its messages' worker id names (`1 [name]`).
 */
export interface RunWorker {
  workerId: string;
  totalWorkers: number;
  projectName: string;
}

/**
 * A host's own pieces, which `createPlatform` uses in order as the support code loads: it reads its
 * worker's run, sets cucumber's worker variables on `env`, imports the support code (which records its calls),
 * closes the registry, locates each call, and builds the runtime on `environment`. Hosts:
 * `../worker/node/platform.ts`, `../worker/browser/platform.ts` (with Storybook's story tests:
 * `../worker/storybook/vitest/platform.ts`), `../worker/storybook/preview/platform.ts`.
 */
export interface Host {
  /** Its worker's run, read once, as the support code loads. */
  worker(): RunWorker;
  /**
   * Where cucumber's worker variables go, which the support code reads: `process.env`, a page's
   * `import.meta.env`.
   */
  env: Record<string, unknown>;
  /** Imports the support code through `importSupport` (node mode: with cucumber's replacement). */
  importSupport(importSupport: ImportSupport): Promise<void>;
  /** Each recorded call's location, from its stack (`cwd`: the project's root). */
  locate(
    stacks: (string | undefined)[],
    cwd: string,
  ): Promise<SupportCall["location"][]>;
  /** The runtime's environment, for `run`: what it takes from its host. */
  environment(run: LoadRun): RuntimeEnvironment;
  /** Whether a summary has colors (Vitest's output's; none without Vitest: Storybook's preview). */
  colors(): boolean;
  /**
   * The command that takes the run's Cucumber Messages to main, when the run's stream has a
   * subscriber; none otherwise
   * (and without Vitest: Storybook's preview). Read as the platform is made (the worker's or page's
   * first feature module).
   */
  messages?: Command;
  /**
   * What the host throws for a run's failures (`what`: the scenario's name, `BeforeAll`,
   * `AfterAll`): a Vitest host, copies as Vitest serializes them (a page's with its BigInts as text);
   * Storybook's preview, the originals (`../worker/platform/errors/thrown.ts`).
   */
  throwable(failures: readonly Failure[], what: string): unknown;
}
