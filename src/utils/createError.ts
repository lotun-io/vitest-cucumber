import type { ResultItem } from "./runCucumber.ts";

export const createError = ({
  id,
  result,
}: {
  id: string;
  result: Pick<
    ResultItem,
    "stepResult" | "error" | "status" | "lineage" | "step"
  > & { name: string };
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

  const scenarioLocation = result.lineage?.scenario?.location;
  const exampleLocation = result.lineage?.example?.location;
  const stepLocation = result.step?.location;

  const frames: string[] = [`    at Feature (${id})`];
  if (scenarioLocation) {
    frames.push(
      `    at Scenario (${id}:${scenarioLocation.line}:${scenarioLocation.column ?? 1})`,
    );
  }
  if (exampleLocation) {
    frames.push(
      `    at Example (${id}:${exampleLocation.line}:${exampleLocation.column ?? 1})`,
    );
  }
  if (stepLocation) {
    frames.push(
      `    at Step (${id}:${stepLocation.line}:${stepLocation.column ?? 1})`,
    );
  }

  err.stack = `${cucumberError}\n${frames.join("\n")}`;
  return err;
};
