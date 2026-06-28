import type { IRunConfiguration } from "@cucumber/cucumber/api";
import * as cucumberApi from "@cucumber/cucumber/api";
import type {
  Pickle,
  Step,
  TestStepResult,
  TestStepResultStatus,
} from "@cucumber/messages";
import { getWorstTestStepResult } from "@cucumber/messages";
import type { Lineage } from "@cucumber/query";
import { Query } from "@cucumber/query";
import { createError } from "./createError.ts";
import type { SerializedError } from "./serializeError.ts";

export type ResultItem = {
  id: string;
  name?: string;
  lineage?: Lineage;
  status?: `${TestStepResultStatus}`;
  stepResult?: TestStepResult;
  step?: Step;
  error?: SerializedError;
  resolvers?: PromiseWithResolvers<unknown>;
};

export type Results = Map<string, ResultItem>;

export type RunCucumberOptions = {
  id: string;
  runConfiguration: IRunConfiguration;
  testStepErrors: Map<string, SerializedError>;
  onTestCaseFinished?: (result: ResultItem) => void;
};

export const runCucumber = async ({
  id,
  runConfiguration,
  testStepErrors,
  onTestCaseFinished,
}: RunCucumberOptions) => {
  const results: Results = new Map();
  const query = new Query();
  const pickleById = new Map<string, Pickle>();
  const parseErrors: string[] = [];
  const hookErrors: Error[] = [];
  const testCaseFinished = new Map<string, boolean>();
  let featureName = "";

  testStepErrors.clear();

  const emitTestCaseFinished = (result: ResultItem) => {
    if (onTestCaseFinished && !testCaseFinished.get(result.id)) {
      testCaseFinished.set(result.id, true);
      onTestCaseFinished(result);
    }
  };

  await cucumberApi
    .runCucumber(runConfiguration, {}, (envelope) => {
      query.update(envelope);
      if (envelope.parseError) {
        const { source, message: msg } = envelope.parseError;
        parseErrors.push(`Parse error in "${source.uri}" ${msg}`);
      }
      if (envelope.gherkinDocument) {
        featureName = envelope.gherkinDocument.feature?.name ?? "";
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
          id: `${results.size}`,
          name: pickle.name,
          lineage,
        });
      }
      if (envelope.testRunHookFinished) {
        const { result } = envelope.testRunHookFinished;
        if (result.status === "FAILED") {
          const error = createError({
            id,
            result: {
              id: "",
              name: "Hook error",
              stepResult: result,
              status: result.status,
            },
          });
          hookErrors.push(error);
        }
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
          emitTestCaseFinished(current);
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
    })
    .finally(() => {
      for (const result of results.values()) {
        emitTestCaseFinished(result);
      }
    });

  if (parseErrors.length > 0) {
    throw new Error(`Parse failure\n${parseErrors.join("\n")}`);
  }
  if (hookErrors.length > 0) {
    throw hookErrors[0];
  }

  return { featureName, results };
};
