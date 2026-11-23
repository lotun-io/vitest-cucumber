// Declares a feature file's Vitest tests from its tree: a `describe` per suite and a test per
// scenario or example, each placed at its Gherkin line so Vitest's `file:line` filters match it;
// an unnamed feature (`""`) no suite, its children under the file (Vitest prints the file's path).
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

/** Declares `parent`'s children in the current suite: a suite each (`registerFeature`), a test each. */
const registerChildren = (
  parent: FeatureSuite,
  declareTest: (test: FeatureTest) => void,
) => {
  for (const child of parent.children) {
    if ("children" in child) {
      registerFeature(child, declareTest);
    } else {
      declareTest(child);
      locate(TestRunner.getCurrentSuite().tasks.at(-1), child);
    }
  }
};

/** Declares `tree`'s suites, and each of its tests through `declareTest`. */
export const registerFeature = (
  tree: FeatureSuite,
  declareTest: (test: FeatureTest) => void,
): void => {
  if (tree.name === "") {
    registerChildren(tree, declareTest);
    return;
  }
  describe(tree.name, () => {
    locate(TestRunner.getCurrentSuite().suite, tree);
    registerChildren(tree, declareTest);
  });
};
