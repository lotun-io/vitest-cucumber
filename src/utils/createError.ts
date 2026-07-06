import type { ResultItem } from "./runCucumber.ts";

export const createError = ({
  id,
  result,
}: {
  id: string;
  result: ResultItem;
}) => {
  const cucumberError = result.stepResult?.message ?? result.status ?? "FAILED";
  const err = new Error(cucumberError);

  const isDiffError =
    result.error?.showDiff ||
    (result.error?.showDiff === undefined &&
      result.error?.actual !== undefined &&
      result.error?.expected !== undefined);

  if (isDiffError) {
    // Avoid double diff: cucumberError already contains a formatted diff; use the bare message so Vitest renders it once.
    Object.assign(err, result.error);
  }

  const scenarioLocation = result.lineage?.scenario?.location;
  const exampleLocation = result.lineage?.example?.location;
  const stepLocation = result.step?.location;

  const frames: string[] = [];
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

  err.stack = [cucumberError, ...frames].join("\n");
  return err;
};
