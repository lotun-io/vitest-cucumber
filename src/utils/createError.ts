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

  const useDiffMessage =
    result.error?.showDiff ||
    (result.error?.showDiff === undefined &&
      result.error?.actual !== undefined &&
      result.error?.expected !== undefined);

  Object.assign(err, {
    // Avoid double diff: cucumberError already contains a formatted diff; use the bare message so Vitest renders it once.
    message: useDiffMessage ? result.error?.message : err.message,
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
