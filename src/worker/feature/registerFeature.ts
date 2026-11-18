// Declares a feature file's Vitest tests from its tree: a `describe` per suite and a test per
// scenario or example, each placed at its Gherkin line so Vitest's `file:line` filters match it.
// Page-safe.
import type { RunnerTask, SuiteCollector } from "vitest";
import { describe, TestRunner } from "vitest";
import type { FeatureSuite, FeatureTest } from "../../types/feature.ts";

/** Puts `task` at its suite's or test's Gherkin line (a collected one: a collector has no location). */
const locate = (
  task: RunnerTask | SuiteCollector | undefined,
  { line, column }: FeatureSuite | FeatureTest,
) => {
  if (task && task.type !== "collector") {
    task.location = { line, column };
  }
};

/** Declares `tree`'s suites, and each of its tests through `declareTest`. */
export const registerFeature = (
  tree: FeatureSuite,
  declareTest: (test: FeatureTest) => void,
): void => {
  describe(tree.name, () => {
    locate(TestRunner.getCurrentSuite().suite, tree);
    for (const child of tree.children) {
      if ("children" in child) {
        registerFeature(child, declareTest);
      } else {
        declareTest(child);
        locate(TestRunner.getCurrentSuite().tasks.at(-1), child);
      }
    }
  });
};
