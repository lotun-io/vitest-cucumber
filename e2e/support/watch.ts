// Vitest in watch mode in a scenario's project: its runs, as each change starts one.
import type { CliOptions, TestModule } from "vitest/node";
import { checkPluginModules } from "./config.ts";
import { capture, resultOfModules, startSession } from "./run.ts";
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
  /** A run that ended: its number (runs counted as they start), its own modules, its output. */
  interface EndedRun {
    run: number;
    modules: readonly TestModule[];
    output: string;
  }
  // The runs started so far, and those not ended yet, in order: Vitest runs one at a time, a run
  // it starts while one goes (a rerun queued) waits for it, so runs end in the order they start
  // (its start may be reported before the one going ends).
  let started = 0;
  const going: number[] = [];
  // Each ended run, kept until a later run is taken; the next run's end; when the last one ended.
  const endedRuns: EndedRun[] = [];
  let runEnded = Promise.withResolvers<undefined>();
  let lastEnd = Date.now();
  // Where the last run's output ended: a run's own is from there to its end.
  let outputFrom = 0;
  // The first test's start of the run `startRun` waits for.
  let testReady = Promise.withResolvers<undefined>();
  // The runs started before `startRun`'s change: its run is the first after them (not taken yet).
  let startedBefore: number | undefined;
  // The session's output, the reporter's below reading it as the first run goes.
  const output = capture();
  const session = await startSession.call(this, {
    filters,
    output,
    options: {
      ...options,
      watch: true,
      reporters: [
        "default",
        {
          onTestRunStart: () => {
            started += 1;
            going.push(started);
          },
          onTestCaseReady: () => {
            testReady.resolve(undefined);
          },
          // Its own modules (Vitest's state has the next run's as it starts) and its output, after
          // the default reporter's summary (reporters are told in order).
          onTestRunEnd: (testModules: readonly TestModule[]) => {
            const text = output.text();
            endedRuns.push({
              run: going.shift() ?? started,
              modules: testModules,
              output: text.slice(outputFrom),
            });
            outputFrom = text.length;
            lastEnd = Date.now();
            runEnded.resolve(undefined);
            runEnded = Promise.withResolvers();
          },
        },
      ],
    } as CliOptions,
  });
  const { vitest, end } = session;
  /**
   * The first run started after the `before` runs, once it ended (a run left over from an earlier
   * change, ending late, isn't it), the ones before it dropped.
   */
  const runAfter = async (before: number) => {
    for (;;) {
      const index = endedRuns.findIndex(({ run }) => run > before);
      const found = endedRuns[index];
      if (found) {
        endedRuns.splice(0, index + 1);
        return found;
      }
      await runEnded.promise;
    }
  };
  /**
   * Vitest idle: no run going, and none started within `quiet` ms of the last one's end (one change
   * may start two runs, the second ~0.1 s after the first ends: a leftover run, not the next
   * change's). What a change starts is counted from then.
   */
  const idle = async (quiet = 200) => {
    for (;;) {
      if (going.length > 0) {
        await runEnded.promise;
        continue;
      }
      const wait = lastEnd + quiet - Date.now();
      if (wait <= 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  };
  /** Run `ended`, as the scenario's last run: its own modules' states, its own output. */
  const takeRun = async (ended: EndedRun) => {
    checkPluginModules(vitest);
    const run = resultOfModules(
      this.dir,
      { exitCode: 0, output: ended.output },
      ended.modules,
    );
    const result = await asRun(run);
    this.result = {
      ...result,
      exitCode: result.tests.some(({ state }) => state === "failed") ? 1 : 0,
    };
  };
  this.watching = {
    /** Waits for the run `change` starts (after a run `startRun` started, if any: its own). */
    rerunAfter: async (change: () => Promise<void>) => {
      // Not during `startRun`'s run: it's going, and taken first.
      if (startedBefore === undefined) {
        await idle();
      }
      const before = started;
      await change();
      if (startedBefore !== undefined) {
        const own = startedBefore;
        startedBefore = undefined;
        await takeRun(await runAfter(own));
      }
      await takeRun(await runAfter(before));
    },
    /** Waits for the run `change` starts to run a test (see `rerunAfter`). */
    startRun: async (change: () => Promise<void>) => {
      await idle();
      testReady = Promise.withResolvers();
      startedBefore = started;
      await change();
      await testReady.promise;
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
  await takeRun(await runAfter(0));
}
