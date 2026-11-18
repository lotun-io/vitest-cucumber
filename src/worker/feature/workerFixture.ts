// The worker fixture, which loads the support code and runs cucumber's test run hooks: the support
// code and the BeforeAll hooks when it's created (by the first feature file with a test to run),
// their error thrown by each file's `beforeAll`, so it's the file's (if BeforeAll failed, every file
// fails without running its tests, as cucumber skips its scenarios). The AfterAll hooks: with
// `isolate` (a worker or page runs one file), in that file's own `afterAll`, their error the file's
// as BeforeAll's; else at the fixture's cleanup (the worker's end), where Vitest reports one error
// (a Teardown or Cleanup Error), so the first of them. Page-safe.
import { inject, test } from "vitest";
import type { HookOutcome, Platform } from "../../types/platform.ts";
import type {} from "../../types/providedContext.ts";
import { pluginError } from "../../utils/errors.ts";

/** The worker's state. */
const worker: {
  /** The platform (every feature file's is the same). */
  platform?: Platform;
  /** Whether the AfterAll hooks ran (once per worker). */
  afterAllRan?: boolean;
} = {};

/** Runs the AfterAll hooks, unless they ran: their outcome (none if they ran). */
const runAfterAll = async (platform: Platform) => {
  if (worker.afterAllRan) {
    return undefined;
  }
  worker.afterAllRan = true;
  return platform.afterAll();
};

/** An outcome's first error: the plugin's AggregateError's first (`../platform/errors/thrown.ts`), else itself. */
const firstError = ({ error }: Extract<HookOutcome, { passed: false }>) => {
  const members: unknown[] =
    error instanceof AggregateError ? error.errors : [];
  return members.length > 0 ? members[0] : error;
};

/** Vitest's `test`, extended with the worker fixture (`cucumberWorker`). */
export const featureTest = test.extend(
  "cucumberWorker",
  { scope: "worker" },
  async ({}, { onCleanup }) => {
    const platform = worker.platform;
    if (!platform) {
      throw pluginError("the worker has no feature file", { internal: true });
    }
    // The support code, loaded as the first file runs (once per worker or page).
    await platform.load();
    const beforeAll = await platform.beforeAll();
    onCleanup(async () => {
      const afterAll = await runAfterAll(platform);
      if (afterAll && !afterAll.passed) {
        throw firstError(afterAll);
      }
    });
    return { beforeAll };
  },
);

/**
 * Hooks a feature file up to the worker fixture: its `beforeAll` fails with the support code's error
 * if it couldn't load, or with the BeforeAll hooks' if they failed; with `isolate`, its `afterAll`
 * runs the AfterAll hooks and fails with their error. Cucumber's timeouts apply, not Vitest's.
 */
export const useWorkerFixture = (platform: Platform) => {
  worker.platform = platform;
  featureTest.beforeAll(({ cucumberWorker }) => {
    if (!cucumberWorker.beforeAll.passed) {
      throw cucumberWorker.beforeAll.error;
    }
  }, 0);
  if (inject("vitestCucumber").isolate) {
    featureTest.afterAll(async ({ cucumberWorker }) => {
      // Destructured: Vitest reads a hook's first parameter for the fixtures it uses.
      void cucumberWorker;
      const afterAll = await runAfterAll(platform);
      if (afterAll && !afterAll.passed) {
        throw afterAll.error;
      }
    }, 0);
  }
};
