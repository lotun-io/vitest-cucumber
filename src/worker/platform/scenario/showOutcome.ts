// A scenario's outcome, shown in its Vitest test (a feature file's, `../../feature/runtime.ts`, or a
// story test's, `../../storybook/vitest/runner.ts`): its attachments, logs and links as annotations, in
// order, while the test still runs; then its skip, or its error (an outcome is never both). Page-safe.
import type { TestContext } from "vitest";
import type { ScenarioOutcome } from "../../../types/platform.ts";

export const showOutcome = async (
  outcome: ScenarioOutcome,
  { annotate, skip }: Pick<TestContext, "annotate" | "skip">,
) => {
  for (const { message, type, attachment } of outcome.annotations) {
    await annotate(message, type, attachment);
  }
  if (outcome.skipped) {
    skip(outcome.skipped.note);
  }
  if (outcome.error) {
    throw outcome.error.value;
  }
};
