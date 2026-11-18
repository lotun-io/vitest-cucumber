// Vitest's test runs, as every `cucumber()` in one Vitest shares them (made by the first plugin in
// `configureVitest`: `testRunsOf`): the one reporter that sees each run start and end (Vitest tells
// reporters, not plugins: added to Vitest's reporters once), which calls each plugin's own part of a
// run's start (`ProjectSource["runStart"]`), tells the run's workers and pages whether to send its
// messages, and makes the run's stream of Cucumber Messages for its subscribers
// (`./runReport.ts`). One per resolved config: a Vitest that restarts (its config file
// changed) resolves it again, its projects, plugins and reporters new.
//
// One run at a time: a run's start makes it the run, its end ends it. Every run gets new workers and
// pages (node mode's processes, a browser's tester iframes, whatever `isolate`); every message's run
// id is none (`""`, written where each message is made), each worker's id its own (Vitest's pool id,
// `../../worker/platform/vitest/vitestHost.ts`).
//
// The stream: only for a subscriber (the repository's e2e and compatibility harness, by this module:
// no public API), and never in watch mode. Runs never overlap there (a rerun asked for while one
// runs would start before the run before it ends: not supported, that run's later batches the next
// run's, its stream never finished). Its last message, `testRunFinished`, with Vitest's verdict of the run
// (every test module passed, no unhandled error), as the run ends: a batch after it is dropped. An
// AfterAll run's batch without `isolate` comes from the worker fixture's cleanup, which released
// Vitest doesn't wait for before the run ends (vitest-dev/vitest#11763): the repository's dev patch
// of Vitest waits for it.
import { type Envelope, TimeConversion } from "@cucumber/messages";
import type {
  Reporter,
  ResolvedConfig,
  TestProject,
  TestSpecification,
  Vitest,
} from "vitest/node";
import type { MessageBatch } from "../../types/messages.ts";
import { createRunReport, type RunReport } from "./runReport.ts";
import { type PlannedFeature, runStartOf } from "./runStart.ts";

/** A project's plugin (the same for all its projects): its part of a run's start. */
export interface ProjectSource {
  /** Its part of a run's start, with its projects' test files of the run: the features it planned. */
  runStart: (
    specifications: readonly TestSpecification[],
  ) => Promise<PlannedFeature[]>;
}

/** A test run: its report (none: nobody wants one). */
interface TestRun {
  report?: RunReport;
}

/** The test runs of a Vitest (`watch`: in watch mode, no stream). */
export const createTestRuns = ({ watch }: { watch: boolean }) => {
  const sources = new Map<TestProject, ProjectSource>();
  const subscribers = new Set<(envelope: Envelope) => void>();
  /** The run running (none between runs). */
  let current: TestRun | undefined;

  const reporter: Reporter = {
    onTestRunStart: async (specifications) => {
      const run: TestRun = {};
      current = run;
      const started = TimeConversion.millisecondsSinceEpochToTimestamp(
        Date.now(),
      );
      const sendMessages = !watch && subscribers.size > 0;
      // Whether the run's workers and pages send its messages (`inject`), before Vitest starts them.
      for (const project of sources.keys()) {
        project.provide("vitestCucumber", {
          ...project.getProvidedContext().vitestCucumber,
          sendMessages,
        });
      }
      // Each plugin's part (once each, whatever its projects), with its projects' test files, before
      // Vitest starts the workers.
      const features = await Promise.all(
        [...new Set(sources.values())].map((source) =>
          source.runStart(
            specifications.filter(
              ({ project }) => sources.get(project) === source,
            ),
          ),
        ),
      );
      if (sendMessages) {
        run.report = createRunReport(runStartOf(started, features.flat()), [
          ...subscribers,
        ]);
      }
    },
    onTestRunEnd: (testModules, unhandledErrors) => {
      const run = current;
      current = undefined;
      run?.report?.end(
        testModules.every((module) => module.ok()) &&
          unhandledErrors.length === 0,
      );
    },
  };

  return {
    /** The reporter that sees the runs start and end (added to Vitest's once: `testRunsOf`). */
    reporter,
    /** `project`'s plugin. */
    register: (project: TestProject, source: ProjectSource) => {
      sources.set(project, source);
    },
    /**
     * Each run's messages to `onMessage`, from the next run's start (none in watch mode); the
     * returned function unsubscribes.
     */
    subscribe: (onMessage: (envelope: Envelope) => void) => {
      subscribers.add(onMessage);
      return () => {
        subscribers.delete(onMessage);
      };
    },
    /** A batch from a worker or page: its run's report (none once that run ended). */
    receive: (batch: MessageBatch) => {
      current?.report?.batch(batch);
    },
  };
};

export type TestRuns = ReturnType<typeof createTestRuns>;

const byConfig = new WeakMap<ResolvedConfig, TestRuns>();

/** `vitest`'s test runs (its config's): made by the first plugin to ask, their reporter added then. */
export const testRunsOf = (vitest: Vitest) => {
  let testRuns = byConfig.get(vitest.config);
  if (!testRuns) {
    testRuns = createTestRuns({ watch: vitest.config.watch });
    byConfig.set(vitest.config, testRuns);
    // Vitest creates its reporters after `configureVitest`: the one reporter for every plugin.
    vitest.config.reporters.push(testRuns.reporter);
  }
  return testRuns;
};
