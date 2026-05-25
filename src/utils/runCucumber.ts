import { describe, test } from "vitest";
import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import * as cucumberApi from "@cucumber/cucumber/api";
import { Query } from "@cucumber/query";

export type Results = Map<
  string,
  { message: string; failingStepLine?: number }
>;

export async function runCucumber({
  id,
  runConfiguration,
  support,
  results,
}: {
  id: string;
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  results: Results;
}) {
  const query = new Query();
  const parseErrors: string[] = [];
  const runtimeNameCount = new Map<string, number>();
  const pickleIdToKey = new Map<string, string>(); // pickle.id          → dedup key
  const testCaseStartedToKey = new Map<string, string>(); // testCaseStarted.id  → dedup key

  await cucumberApi.runCucumber(
    {
      ...runConfiguration,
      sources: { ...runConfiguration.sources, paths: [id] },
      support,
    },
    {},
    (message) => {
      if (message.parseError) {
        const { source, message: msg } = message.parseError;
        parseErrors.push(`Parse error in "${source.uri}" ${msg}`);
        return;
      }
      query.update(message);
      if (message.pickle) {
        const { id: pickleId, name } = message.pickle;
        const count = (runtimeNameCount.get(name) ?? 0) + 1;
        runtimeNameCount.set(name, count);
        pickleIdToKey.set(pickleId, count === 1 ? name : `${name} (${count})`);
      }
      if (message.testCaseStarted) {
        const pickle = query.findPickleBy(message.testCaseStarted)!;
        const key = pickleIdToKey.get(pickle.id)!;
        testCaseStartedToKey.set(message.testCaseStarted.id, key);
        results.set(key, { message: "skipped" }); // default; updated by step events below
      }
      if (message.testStepFinished) {
        const testStep = query.findTestStepBy(message.testStepFinished);
        const pickleStep = testStep && query.findPickleStepBy(testStep);
        const key = testCaseStartedToKey.get(
          message.testStepFinished.testCaseStartedId,
        )!;
        const current = results.get(key)!;
        const { status, message: failMsg } =
          message.testStepFinished.testStepResult;
        const caseHasFailed =
          current.message !== "skipped" && current.message !== "passed";

        if (!pickleStep) {
          // Before/After hook — only track failures, ignore passes/skips
          if (status === "FAILED" && !caseHasFailed) {
            results.set(key, { message: failMsg ?? "Hook failed" });
          }
        }
        if (status === "PASSED" && current.message === "skipped") {
          results.set(key, { message: "passed" });
        }
        // failure — first failure wins, ignore subsequent step failures
        if (
          status === "PASSED" ||
          status === "SKIPPED" ||
          caseHasFailed ||
          !pickleStep
        ) {
          return;
        }
        const failingStepLine = query.findStepBy(pickleStep)?.location?.line;
        results.set(key, { message: failMsg ?? status, failingStepLine });
      }
    },
  );

  if (parseErrors.length > 0) {
    throw new Error(`Parse failure\n${parseErrors.join("\n")}`);
  }

  return results;
}

export function registerFeatureTests({
  featureName,
  scenarios,
  id,
  results,
}: {
  featureName: string;
  scenarios: Array<{ name: string; ruleName: string | null; line: number }>;
  id: string;
  results: Results;
}): void {
  describe(featureName, () => {
    const byRule = new Map<
      string | null,
      Array<{ name: string; line: number }>
    >();
    for (const { name, ruleName, line } of scenarios) {
      const group = byRule.get(ruleName) ?? [];
      group.push({ name, line });
      byRule.set(ruleName, group);
    }

    for (const [ruleName, ruleScenarios] of byRule) {
      const defineTests = () => {
        for (const { name, line } of ruleScenarios) {
          test(name, (ctx) => {
            // If no result exists, the scenario was filtered out by Cucumber (e.g. by tags) and should be skipped.
            const result = results.get(name) ?? { message: "skipped" };
            if (result.message === "skipped") {
              ctx.skip();
            }
            if (result.message !== "passed") {
              const cucumberError =
                result.message ?? "Cucumber scenario did not run";
              const err = new Error(cucumberError);
              const stepLine = result.failingStepLine ?? line;
              // Full Cucumber error (including diff) stays in err.message so Vitest renders it.
              // The feature file frame in err.stack gives a clickable link to the failing step.
              err.stack = `${cucumberError}\n    at ${id}:${stepLine}:1`;

              throw err;
            }
          });
        }
      };

      if (ruleName === null) {
        defineTests();
      } else {
        describe(ruleName, defineTests);
      }
    }
  });
}
