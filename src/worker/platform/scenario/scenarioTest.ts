// A scenario run as its Vitest test (a feature file's, `../../feature/runtime.ts`, or a story test's,
// `../../storybook/vitest/runner.ts`): Vitest's attempt is cucumber's (`./attempts.ts`), and its
// outcome is shown in the test (`./showOutcome.ts`). Page-safe.
import type { RunnerTestCase, TestContext } from "vitest";
import type { Platform, ScenarioToRun } from "../../../types/platform.ts";
import { vitestAttemptOf } from "./attempts.ts";
import { showOutcome } from "./showOutcome.ts";

/** Runs `scenario` on `platform` as its test `task`'s attempt, shown through `context`. */
export const runScenarioTest = async (
  platform: Platform,
  scenario: ScenarioToRun,
  task: RunnerTestCase,
  context: Pick<TestContext, "annotate" | "skip">,
) => {
  const outcome = await platform.scenario({
    ...scenario,
    attempt: vitestAttemptOf(task),
  });
  await showOutcome(outcome, context);
};
