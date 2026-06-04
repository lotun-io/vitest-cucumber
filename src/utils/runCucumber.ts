import { describe, test } from "vitest";
import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import * as cucumberApi from "@cucumber/cucumber/api";
import { Query } from "@cucumber/query";
import type { Lineage } from "@cucumber/query";
import { getWorstTestStepResult } from "@cucumber/messages";
import type {
  Pickle,
  Step,
  TestStepResult,
  TestStepResultStatus,
} from "@cucumber/messages";
import { createError } from "./createError.ts";

export type ResultItem = {
  resolvers: PromiseWithResolvers<unknown>;
  name: string;
  lineage?: Lineage;
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
  onTestCasesReady,
}: {
  id: string;
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  testStepErrors: Map<string, Error>;
  onTestCasesReady?: (params: RegisterFeatureTestsParams) => void;
}) => {
  const results: Results = new Map();
  const query = new Query();
  const pickleById = new Map<string, Pickle>();
  const parseErrors: string[] = [];
  let featureName = "Feature";

  let notifyReady: (() => void) | undefined = () => {
    onTestCasesReady?.({ id, featureName, results });
    notifyReady = undefined;
  };

  await cucumberApi
    .runCucumber(
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
        if (envelope.gherkinDocument) {
          featureName = envelope.gherkinDocument.feature?.name || "Feature";
        }
        if (envelope.pickle) {
          pickleById.set(envelope.pickle.id, envelope.pickle);
        }
        if (envelope.testCase) {
          const pickle = pickleById.get(envelope.testCase.pickleId);
          if (!pickle) {
            throw new Error("Pickle not found");
          }
          const lineage = query.findLineageBy(pickle);
          results.set(envelope.testCase.pickleId, {
            name: pickle.name,
            lineage,
            resolvers: Promise.withResolvers(),
          });
        }
        if (envelope.testCaseStarted) {
          const pickle = query.findPickleBy(envelope.testCaseStarted);
          if (!pickle) {
            throw new Error("Pickle not found");
          }
          const current = results.get(pickle.id);
          if (!current) {
            throw new Error("Result not found");
          }
          // reset for retry
          current.status = undefined;
          current.stepResult = undefined;
          current.step = undefined;
          current.error = undefined;
          notifyReady?.();
        }
        if (envelope.testCaseFinished) {
          const pickle = query.findPickleBy(envelope.testCaseFinished);
          if (!pickle) {
            throw new Error("Pickle not found");
          }
          const current = results.get(pickle.id);
          if (!current) {
            throw new Error("Result not found");
          }
          const testSteps = query.findTestStepsFinishedBy(
            envelope.testCaseFinished,
          );
          if (!envelope.testCaseFinished.willBeRetried) {
            if (testSteps.length === 0) {
              current.status = "SKIPPED";
            }
            current.resolvers.resolve(null);
          }
        }

        if (envelope.testStepFinished) {
          const pickle = query.findPickleBy(envelope.testStepFinished);
          if (!pickle) {
            throw new Error("Pickle not found");
          }
          const current = results.get(pickle.id);
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
          current.status = worstStepResult.status;
          current.stepResult = worstStepResult;
          current.step = step ?? current.step;
          current.error = testStepError ?? current.error;
        }
      },
    )
    .finally(() => {
      for (const result of results.values()) {
        result.resolvers.resolve(null);
      }
      notifyReady?.();
    });

  if (parseErrors.length > 0) {
    throw new Error(`Parse failure\n${parseErrors.join("\n")}`);
  }

  return results;
};

export type RegisterFeatureTestsParams = {
  id: string;
  featureName: string;
  results: Results;
};

export const registerFeatureTests = ({
  id,
  featureName,
  results,
}: RegisterFeatureTestsParams): void => {
  describe(featureName, () => {
    const groups: { ruleName: string | null; items: ResultItem[] }[] = [];
    for (const result of results.values()) {
      const ruleName = result.lineage?.rule?.name ?? null;
      const last = groups.at(-1);
      if (last && last.ruleName === ruleName) {
        last.items.push(result);
      } else {
        groups.push({ ruleName, items: [result] });
      }
    }

    for (const { ruleName, items } of groups) {
      const defineTests = () => {
        const nameCount = new Map<string, number>();
        for (const result of items) {
          const count = (nameCount.get(result.name) ?? 0) + 1;
          nameCount.set(result.name, count);
          const dedupName =
            count === 1 ? result.name : `${result.name} (${count})`;
          test(
            dedupName,
            async (ctx) => {
              await result.resolvers.promise;
              const status = result.status ?? "FAILED";
              if (status === "SKIPPED") {
                ctx.skip();
              }
              if (status !== "PASSED") {
                throw createError({ id, result });
              }
            },
            0,
          );
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
