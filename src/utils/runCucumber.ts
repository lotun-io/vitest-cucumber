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
import { getScenarioKey } from "./parser.ts";
import type { Lineage } from "@cucumber/query";

export type ResultItem = {
  resolvers: PromiseWithResolvers<unknown>;
  name?: string;
  status?: `${TestStepResultStatus}`;
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
  testStepErrors,
  results,
}: {
  id: string;
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  testStepErrors: Map<string, Error>;
  results: Results;
}) => {
  const query = new Query();
  const parseErrors: string[] = [];

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
      if (envelope.testCaseStarted) {
        const pickle = query.findPickleBy(envelope.testCaseStarted);
        if (!pickle) {
          throw new Error("Pickle not found");
        }
        const key = getScenarioKey({ query, pickle });
        const current = results.get(key);
        if (!current) {
          throw new Error("Result not found");
        }
        current.name = undefined;
        current.status = undefined;
        current.stepResult = undefined;
        current.step = undefined;
        current.error = undefined;
      }
      if (envelope.testCaseFinished) {
        const pickle = query.findPickleBy(envelope.testCaseFinished);
        if (!pickle) {
          throw new Error("Pickle not found");
        }
        const key = getScenarioKey({ query, pickle });
        const current = results.get(key);
        if (!current) {
          throw new Error("Result not found");
        }
        if (!envelope.testCaseFinished.willBeRetried) {
          current.resolvers.resolve(null);
        }
      }
      if (envelope.testStepFinished) {
        const pickle = query.findPickleBy(envelope.testStepFinished);
        if (!pickle) {
          throw new Error("Pickle not found");
        }
        const key = getScenarioKey({ query, pickle });
        const current = results.get(key);
        if (!current) {
          throw new Error("Result not found");
        }
        const testStep = query.findTestStepBy(envelope.testStepFinished);
        const pickleStep = testStep && query.findPickleStepBy(testStep);
        const stepResult = envelope.testStepFinished.testStepResult;
        const worstStepResult = current.stepResult
          ? getWorstTestStepResult([current.stepResult, stepResult])
          : stepResult;
        const step = pickleStep ? query.findStepBy(pickleStep) : undefined;
        const testStepError = testStepErrors.get(
          envelope.testStepFinished.testStepId,
        );
        current.name = pickle.name;
        current.status = worstStepResult.status;
        current.stepResult = worstStepResult;
        current.step = step ?? current.step;
        current.error = testStepError ?? current.error;
      }
    },
  );

  if (parseErrors.length > 0) {
    throw new Error(`Parse failure\n${parseErrors.join("\n")}`);
  }

  return results;
};

export const registerFeatureTests = ({
  id,
  featureName,
  pickles,
  results,
}: {
  id: string;
  featureName: string;
  pickles: Array<{ key: string; name: string; lineage?: Lineage }>;
  results: Results;
}): void => {
  describe(featureName, () => {
    const byRule = new Map<
      string | null,
      Array<{ key: string; name: string; lineage?: Lineage }>
    >();
    for (const { key, name, lineage } of pickles) {
      const ruleName = lineage?.rule?.name ?? null;
      const group = byRule.get(ruleName) ?? [];
      group.push({ key, name, lineage });
      byRule.set(ruleName, group);
    }

    for (const [ruleName, ruleScenarios] of byRule) {
      const defineTests = () => {
        const nameCount = new Map<string, number>();
        for (const { key, name, lineage } of ruleScenarios) {
          const count = (nameCount.get(name) ?? 0) + 1;
          nameCount.set(name, count);
          const dedupName = count === 1 ? name : `${name} (${count})`;
          const result = results.get(key);
          if (!result) {
            throw new Error("Result not found");
          }
          test(
            dedupName,
            async (ctx) => {
              await result.resolvers.promise;
              const status = result.status ?? "SKIPPED";
              if (status === "SKIPPED") {
                ctx.skip();
              }
              if (status !== "PASSED") {
                throw createError({ id, lineage, result });
              }
            },
            0,
          );
        }
      };

      if (ruleName === null) {
        defineTests();
      } else {
        describe.concurrent(ruleName, defineTests);
      }
    }
  });
};
