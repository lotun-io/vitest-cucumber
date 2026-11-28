// Whether a successful scenario run is a skipped test, and why. Cucumber's status of a scenario is its
// worst step or hook result (`@cucumber/messages`' `getWorstTestStepResult`, cucumber's own), and a run
// succeeds with some statuses that aren't `PASSED` (`../../runner/statuses.ts`'s `shouldCauseFailure`: a dry run never fails,
// `PENDING` only with `strict`):
// - `SKIPPED` (a step or hook returned `skipped`, whatever passed around it; a dry run's defined
//   steps): skipped;
// - `PENDING` (`strict: false`), `UNDEFINED` or `AMBIGUOUS` (a dry run): skipped, its note its first
//   such step as the summary heads them (`Pending step: When a pending step`), as part of the
//   scenario never ran;
// - anything else passes, e.g. no result at all (no steps, no hooks: cucumber's formatters report
//   it passed). (An After hook can't make a failed step pass: it gets a copy of the result.)
// Decided where the run ran: the worker in node mode, the page in browser mode. Page-safe.
import {
  getWorstTestStepResult,
  TestStepResultStatus,
} from "@cucumber/messages";
import type { Query } from "../../../types/query.ts";
import { isUnexplained } from "../../runner/statuses.ts";
import { formatStatusName } from "../summary/formatting.ts";

/** A successful scenario run's skip, with its note (see the module comment), or none: it passed. */
export const skipOf = (query: Query): { note?: string } | undefined => {
  const finished = query.testStepResults();
  const { status } = getWorstTestStepResult(
    finished.map(({ result }) => result),
  );
  if (status === TestStepResultStatus.SKIPPED) {
    return {};
  }
  // Undefined, pending or ambiguous: a note.
  if (!isUnexplained(status)) {
    return undefined;
  }
  const first = finished.find(({ result }) => result.status === status);
  // A hook's text is its failure's (`Before hook failed`): here, the hook.
  const { text } = query.testStepOf(first?.testStepId);
  // As the summary's sections (`Pending steps:`), the status's name capitalized.
  return {
    note: `${formatStatusName(status)} step: ${text.replace(/ failed$/, "")}`,
  };
};
