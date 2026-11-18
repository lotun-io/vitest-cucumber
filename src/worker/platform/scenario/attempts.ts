// A scenario's attempts, Vitest's: each Vitest attempt of its test is one attempt of cucumber's (the
// runtime's test case run gets its number and whether more remain), read from the test, never
// changed: Vitest runs every attempt its `retry` allows, and the platform fails one cucumber wouldn't
// run with the last one's error (`../createPlatform.ts`). Page-safe.
import type { RunnerTestCase } from "vitest";

/**
 * The attempt of `task` (a running test) Vitest runs, in its repeat, and whether more remain: its
 * attempts recorded so far in this repeat (Vitest records each as it ends, `result.attempts`, with
 * its `repeatIndex`; `result.repeatCount` is the repeat running), out of its `retry`'s.
 */
export const vitestAttemptOf = (task: RunnerTestCase) => {
  const { attempts = [], repeatCount = 0 } = task.result ?? {};
  const attempt = attempts.filter(
    ({ repeatIndex }) => repeatIndex === repeatCount,
  ).length;
  const { retry } = task;
  const retries = typeof retry === "number" ? retry : (retry?.count ?? 0);
  return { attempt, moreAttemptsRemaining: attempt < retries };
};
