import { describe, test } from "vitest";
import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import * as cucumberApi from "@cucumber/cucumber/api";
import { Query } from "@cucumber/query";
import { getWorstTestStepResult } from "@cucumber/messages";
import type {
  Step,
  TestStepResult,
  TestStepResultStatus,
} from "@cucumber/messages";
import { createError } from "./createError.ts";
import { dedupName } from "./parser.ts";

export type ResultItem = {
  status: `${TestStepResultStatus}`;
  stepResult?: TestStepResult;
  step?: Step;
  error?: Error & {
    showDiff?: boolean;
    expected?: unknown;
    actual?: unknown;
  };
};

export type Results = Map<string, ResultItem>;

export const runCucumber = async ({
  id,
  runConfiguration,
  support,
  testCaseErrors,
  results,
}: {
  id: string;
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  testCaseErrors: Map<string, Error>;
  results: Results;
}) => {
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
        pickleIdToKey.set(pickleId, dedupName(name, count));
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
        const worstStepResult = current?.stepResult
          ? getWorstTestStepResult([current.stepResult, stepResult])
          : stepResult;
        const step = pickleStep ? query.findStepBy(pickleStep) : undefined;
        const testCaseError = testCaseErrors.get(
          envelope.testStepFinished.testCaseStartedId,
        );
        results.set(key, {
          status: worstStepResult.status,
          stepResult: worstStepResult,
          step: step ?? current?.step,
          error: testCaseError ?? current?.error,
        });
      }
    },
  );

  if (parseErrors.length > 0) {
    throw new Error(`Parse failure\n${parseErrors.join("\n")}`);
  }

  return results;
};

export const registerFeatureTests = ({
  featureName,
  scenarios,
  id,
  results,
}: {
  featureName: string;
  scenarios: Array<{ name: string; ruleName: string | null; line: number }>;
  id: string;
  results: Results;
}): void => {
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
            const result = results.get(name) ?? { status: "SKIPPED" };
            if (result.status === "SKIPPED" || result.status === "PENDING") {
              ctx.skip();
            }
            if (result.status !== "PASSED") {
              throw createError({ id, line, result });
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
};
