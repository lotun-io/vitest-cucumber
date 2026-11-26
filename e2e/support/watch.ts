// Vitest in watch mode in a scenario's project: its runs, as each change starts one.
import type { CliOptions, TestModule } from "vitest/node";
import { checkPluginModules } from "./config.ts";
import { runResult, startSession } from "./run.ts";
import { runAs } from "./storybookProject.ts";
import type { E2EWorld } from "./world.ts";

/**
 * Starts Vitest in watch mode: its first run is the scenario's last run, until a change reruns it
 * (see `rerunAfter`). Closed after the scenario (see `./world.ts`).
 */
export async function watchVitest(
  this: E2EWorld,
  { filters, options = {} }: { filters?: string[]; options?: CliOptions } = {},
) {
  // A Storybook project's runs: its feature files as stories (see `featureStoriesFiles`).
  const asRun = await runAs.call(this);
  // Each test run's end, and its first test's start.
  let runEnded = Promise.withResolvers<undefined>();
  const ended = () => runEnded.promise;
  let testReady = Promise.withResolvers<undefined>();
  // A run `startRun` started, not taken yet.
  let running = false;
  // The test modules of the run that ended last (Vitest's state keeps every module of the session).
  let lastModules: readonly TestModule[] = [];
  const session = await startSession.call(this, {
    filters,
    options: {
      ...options,
      watch: true,
      reporters: [
        "default",
        {
          onTestCaseReady: () => {
            testReady.resolve(undefined);
          },
          onTestRunEnd: (testModules: readonly TestModule[]) => {
            lastModules = testModules;
            runEnded.resolve(undefined);
          },
        },
      ],
    } as CliOptions,
  });
  const { vitest, output, end } = session;
  /** The run that ended, and nothing of it for the next one. */
  const takeRun = async () => {
    checkPluginModules(vitest);
    // The run's own modules: a rerun of other files than the last run's leaves those in Vitest's state.
    const run = runResult(
      vitest,
      this.dir,
      { exitCode: 0, output: output.text() },
      lastModules,
    );
    output.clear();
    runEnded = Promise.withResolvers();
    const result = await asRun(run);
    this.result = {
      ...result,
      exitCode: result.tests.some(({ state }) => state === "failed") ? 1 : 0,
    };
  };
  this.watching = {
    /** Waits for the run `change` starts (after a run `startRun` started, if any: its own). */
    rerunAfter: async (change: () => Promise<void>) => {
      await change();
      if (running) {
        running = false;
        await ended();
        await takeRun();
      }
      await ended();
      await takeRun();
    },
    /** Waits for the run `change` starts to run a test (see `rerunAfter`). */
    startRun: async (change: () => Promise<void>) => {
      testReady = Promise.withResolvers();
      await change();
      await testReady.promise;
      running = true;
    },
    /**
     * As Vitest's `p` key: the test files matching `pattern` (its search, `globTestSpecifications`:
     * every project's `globTestFiles`), rerun, through Vitest's public API. Unlike the key, the
     * pattern isn't kept for later reruns (no public way): a scenario changing the filter ends there.
     */
    changeFilter: async (pattern: string) => {
      const specifications = await vitest.globTestSpecifications([pattern]);
      await this.watching?.rerunAfter(() =>
        vitest.rerunTestSpecifications(specifications).then(() => undefined),
      );
    },
    close: async () => {
      try {
        await vitest.close();
      } finally {
        end();
      }
    },
  };
  await ended();
  await takeRun();
}
