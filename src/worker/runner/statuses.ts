// What a test step result's status means for its run and its test, in one place:
// - `shouldCauseFailure` (a port of cucumber 13.3.0's, `lib/runtime/helpers.ts`): whether a
//   scenario's worst status fails its run, by the run's options (a dry run never fails, `PENDING`
//   only with `strict`): the run's success (`./runner.ts`);
// - `isFailing`: of a run that failed, the results that are its test's errors
//   (`../platform/errors/testErrors.ts`). `PENDING` is one whatever `strict` says: it's asked of
//   a failed run's results only;
// - `isUnexplained`: the failing ones with no error of their own (undefined, pending, ambiguous):
//   what cucumber's summary lists (`../platform/summary/summary.ts`), and a skipped test's note
//   (`../platform/scenario/skipped.ts`).
// Page-safe.
import { TestStepResultStatus } from "@cucumber/messages";

/** Cucumber's `shouldCauseFailure`. */
export const shouldCauseFailure = (
  status: TestStepResultStatus,
  { dryRun, strict }: { dryRun: boolean; strict: boolean },
) => {
  if (dryRun) {
    return false;
  }
  const failureStatuses: string[] = [
    TestStepResultStatus.AMBIGUOUS,
    TestStepResultStatus.FAILED,
    TestStepResultStatus.UNDEFINED,
  ];
  if (strict) {
    failureStatuses.push(TestStepResultStatus.PENDING);
  }
  return failureStatuses.includes(status);
};

const failing = new Set(["FAILED", "AMBIGUOUS", "UNDEFINED", "PENDING"]);

/** Whether `status` fails its test. */
export const isFailing = (status: string) => failing.has(status);

/** Whether `status` fails its test without an error of its own: undefined, pending or ambiguous. */
export const isUnexplained = (status: string) =>
  status !== "FAILED" && failing.has(status);
