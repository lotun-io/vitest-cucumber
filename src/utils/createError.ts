import type { ResultItem } from "./runCucumber.ts";

export const createError = ({
  id,
  line,
  result,
}: {
  id: string;
  line: number;
  result: ResultItem;
}) => {
  const cucumberError = result.stepResult?.message ?? result.status;
  const err = new Error(cucumberError);

  Object.assign(err, {
    message: result.error?.showDiff
      ? result.stepResult?.exception?.message
      : err.message,
    showDiff: result.error?.showDiff,
    expected: result.error?.expected,
    actual: result.error?.actual,
  });

  const stepLine = result.step?.location.line ?? line;
  const stepColumn = result.step?.location.column ?? 1;
  // Full Cucumber error message
  // The feature file frame in err.stack gives a clickable link to the failing step.
  err.stack = `${cucumberError}\n    at ${id}:${stepLine}:${stepColumn}`;
  return err;
};
