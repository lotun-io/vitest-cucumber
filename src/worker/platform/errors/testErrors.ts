// A failed cucumber run's failures, a scenario's or a BeforeAll or AfterAll run's, for the host to
// throw (`Host["throwable"]`, `./thrown.ts`): each failing result's errors in cucumber's order, as
// the user's code threw them, a scenario step's with the step's line (its frame: the host adds it to
// the stack it sends, for Vitest's code frame); none is a bug of the plugin's:
// - a failed step or hook: its real errors (`../../runner/failures.ts`: what its code threw, rejected with
//   or passed its callback, so Vitest shows its diff; or cucumber's own, e.g. a timeout);
// - a crash of the run (e.g. a World's constructor): its real error, last;
// - undefined, pending or ambiguous steps: one error for all of them, the first one's step text at
//   its line, then cucumber's summary, in its message (every reporter keeps a message, and Storybook's
//   panel shows only that: not a cause).
import type {
  Failure,
  StepFrame as Frame,
  Run,
} from "../../../types/platform.ts";
import type { Query } from "../../../types/query.ts";
import { internalErrorMessage, pluginError } from "../../../utils/errors.ts";
import { failuresOf } from "../../runner/failures.ts";
import { isFailing } from "../../runner/statuses.ts";
import { isError } from "./errorKinds.ts";
import { errorAt, frameAt } from "./stacks.ts";

/** `value` if it's an error, else an error with `text` at `frame`, `value` as its cause. */
const asError = (value: unknown, text: string, frame: Frame | undefined) =>
  isError(value) ? value : errorAt(text, frame, value);

/** What `errorsOf` needs to know about a scenario: its feature file and its summary. */
interface ScenarioOf {
  /** The feature file's path. */
  file: string;
  /** Cucumber's summary of the scenario's run. */
  summary: string | undefined;
}

/** A test step's text, and a stack frame at its line in the feature file `file`. */
const stepAt = (query: Query, testStepId: string | undefined, file: string) => {
  const { text, location } = query.testStepOf(testStepId);
  return { text, frame: location && frameAt(file, location) };
};

/** The error for undefined, pending or ambiguous steps: the step's text at its line, then the summary. */
const scenarioErrorOf = (
  query: Query,
  testStepId: string | undefined,
  { file, summary }: ScenarioOf,
) => {
  const { text, frame } = stepAt(query, testStepId, file);
  return errorAt(summary ? `${text}\n\n${summary}` : text, frame, undefined);
};

/**
 * The plugin's error when building the summary failed (a bug of the plugin's, not the user's). It
 * points at the scenario's first undefined, pending or ambiguous step, with `error` as its cause.
 */
export const summaryFailureOf = (
  { query }: Run,
  file: string,
  error: unknown,
): Failure[] => {
  const { text, frame } = stepAt(
    query,
    query.firstUnexplained()?.testStepId,
    file,
  );
  return [
    {
      value: errorAt(
        internalErrorMessage(`cucumber's summary of "${text}" failed`),
        frame,
        error,
      ),
    },
  ];
};

/**
 * A failed run's failures (see the module comment). A thrown value that isn't an error is wrapped in
 * one with the step's text (or `what failed` for a test run hook) at its line, the value as its
 * cause. `scenario` is set for a scenario's run.
 */
export const errorsOf = (
  { query }: Run,
  what: string,
  scenario?: ScenarioOf,
): Failure[] => {
  let summarized = false;
  const results = query.results().flatMap((finished): Failure[] => {
    if (!isFailing(finished.result.status)) {
      return [];
    }
    const step = scenario && stepAt(query, finished.testStepId, scenario.file);
    const frame = step?.frame;
    if (finished.result.status === "FAILED") {
      const failures = failuresOf(finished.result);
      if (failures.length === 0) {
        throw pluginError("a failed result without its error", {
          internal: true,
        });
      }
      return failures.map((error) =>
        isError(error)
          ? { value: error, ...(frame && { frame }) }
          : { value: errorAt(step?.text ?? `${what} failed`, frame, error) },
      );
    }
    if (!scenario || summarized) {
      return [];
    }
    summarized = true;
    return [{ value: scenarioErrorOf(query, finished.testStepId, scenario) }];
  });
  const crashes = failuresOf(query.testRunFinished()).map((error) => ({
    value: asError(error, `${what} failed`, undefined),
  }));
  const all = [...results, ...crashes];
  // A failed run always has an error: a failed result's, the summary's, a crash's.
  if (all.length === 0) {
    throw pluginError(`a failed ${what} without its errors`, {
      internal: true,
    });
  }
  return all;
};
