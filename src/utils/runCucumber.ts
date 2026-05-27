import { describe, test } from "vitest";
import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import * as cucumberApi from "@cucumber/cucumber/api";
import { Query } from "@cucumber/query";
import type {
  Step,
  TestStepResult,
  TestStepResultStatus,
} from "@cucumber/messages";

export type Results = Map<
  string,
  {
    status: `${TestStepResultStatus}`;
    stepResult?: TestStepResult;
    step?: Step;
  }
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
    (envelope) => {
      query.update(envelope);
      if (envelope.parseError) {
        const { source, message: msg } = envelope.parseError;
        parseErrors.push(`Parse error in "${source.uri}" ${msg}`);
      }
      if (envelope.pickle) {
        const { id: pickleId, name } = envelope.pickle;
        const count = (runtimeNameCount.get(name) ?? 0) + 1;
        runtimeNameCount.set(name, count);
        pickleIdToKey.set(pickleId, count === 1 ? name : `${name} (${count})`);
      }
      if (envelope.testCaseStarted) {
        const pickle = query.findPickleBy(envelope.testCaseStarted)!;
        const key = pickleIdToKey.get(pickle.id)!;
        testCaseStartedToKey.set(envelope.testCaseStarted.id, key);
      }
      if (envelope.testStepFinished) {
        const testStep = query.findTestStepBy(envelope.testStepFinished);
        const pickleStep = testStep && query.findPickleStepBy(testStep);
        const key =
          testCaseStartedToKey.get(
            envelope.testStepFinished.testCaseStartedId,
          ) ?? "";
        const current = results.get(key);
        const stepResult = envelope.testStepFinished.testStepResult;

        // After a step fails, Cucumber still emits testStepFinished for remaining (skipped) steps.
        // Keep the first failure so we don't overwrite the real error with a SKIPPED result.
        if (current?.stepResult?.exception) {
          return;
        }
        const step = pickleStep ? query.findStepBy(pickleStep) : undefined;
        results.set(key, { status: stepResult.status, stepResult, step });
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
            const result = results.get(name) ?? { status: "SKIPPED" as const };
            if (result.status === "SKIPPED") {
              ctx.skip();
            }
            if (result.status !== "PASSED") {
              const cucumberError = result.stepResult?.message ?? result.status;
              const err = new Error(cucumberError);
              const stepLine = result.step?.location.line ?? line;
              const stepColumn = result.step?.location.column ?? 1;
              // Full Cucumber error (including diff) stays in err.message so Vitest renders it.
              // The feature file frame in err.stack gives a clickable link to the failing step.
              err.stack = `${cucumberError}\n    at ${id}:${stepLine}:${stepColumn}`;
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
