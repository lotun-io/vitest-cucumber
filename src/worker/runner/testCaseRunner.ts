// One test case, run as cucumber's test case runner runs one attempt (a port of 13.3.0's
// `lib/runtime/test_case_runner.ts`, with its `step_runner.ts`): a World per test case (its `attach`,
// `log` and `link` emit attachments while a step or hook runs, its parameters a clone of the world
// parameters), then each test step in order with its messages (`testStepStarted`, `testStepFinished`).
// Once a result isn't `PASSED`, later steps are skipped and Before hooks too, After hooks still run
// (they get the worst result so far, its object as it is: a hook can change it, as cucumber's can).
// A step runs between the `BeforeStep` hooks that apply (by tags) and the `AfterStep` hooks (in
// reverse), unless a BeforeStep hook failed. Each definition gets cucumber's parameters (a step: its
// arguments' values, then its data table or doc string; a hook: its hook parameter) and its arity
// check. An attempt is Vitest's (its number and whether more remain: `../platform/scenario/attempts.ts`), its
// `willBeRetried` cucumber's (Vitest's retries stop when it's false). An undefined step's suggestion is cucumber's (`./suggestion.ts`).
// Page-safe.
import type { AssembledTestCase, AssembledTestStep } from "@cucumber/core";
import type { IWorldOptions } from "@cucumber/cucumber";
import {
  getWorstTestStepResult,
  TestStepResultStatus,
  TimeConversion,
  type Envelope,
  type GherkinDocument,
  type Pickle,
  type PickleStep,
  type Step,
  type TestStepResult,
} from "@cucumber/messages";
import type { RuntimeEnvironment } from "../../types/runtimeEnvironment.ts";
import type {
  Code,
  Definition,
  StepHook,
  SupportCode,
  WorldConstructor,
} from "../../types/supportCode.ts";
import { pluginError } from "../../utils/errors.ts";
import { DataTable } from "../cucumber/dataTable.ts";
import { World as DefaultWorld } from "../cucumber/world.ts";
import { noDuration, startStopwatch, timestamp } from "./clock.ts";
import { withFailures } from "./failures.ts";
import { formatSimpleError } from "./formatError.ts";
import { makeSuggestion } from "./suggestion.ts";
import { runUserCode, textOf } from "./userCode.ts";

interface TestCaseRun {
  gherkinDocument: GherkinDocument;
  pickle: Pickle;
  testCase: AssembledTestCase;
  support: SupportCode;
  worldParameters: unknown;
  /** A dry run: no hook runs, a defined step is skipped. */
  skip: boolean;
  newId: () => string;
  workerId: string;
  /** Its attempt, Vitest's, and whether more remain (cucumber's `willBeRetried`). */
  attempt: number;
  moreAttemptsRemaining: boolean;
  emit(envelope: Envelope): void;
  /** A pickle step's Gherkin step (the run's query's: its keyword labels the step in `around`). */
  stepOf(pickleStep: PickleStep): Step | undefined;
  /** The platform's part (`../../types/runtimeEnvironment.ts`). */
  environment: RuntimeEnvironment;
}

/** What a definition gets, and the code lengths it may have (cucumber's `getInvocationParameters`). */
interface Invocation {
  parameters: unknown[];
  validCodeLengths: number[];
  invalidCodeLengthMessage: () => string;
}

/** Cucumber's `buildInvalidCodeLengthMessage`. */
const invalidCodeLength = (
  code: Code,
  syncOrPromise: string | number,
  callback: string | number,
) =>
  `function has ${String(code.length)} arguments, should have ${String(syncOrPromise)} (if synchronous or returning a promise) or ${String(callback)} (if accepting a callback)`;

/** A hook's invocation: its hook parameter; 0 or 1 arguments, or 2 with a callback. */
const hookInvocation = (code: Code, hookParameter: object): Invocation => ({
  parameters: [hookParameter],
  validCodeLengths: [0, 1, 2],
  invalidCodeLengthMessage: () => invalidCodeLength(code, "0 or 1", "2"),
});

const skipped = (): TestStepResult => ({
  status: TestStepResultStatus.SKIPPED,
  duration: noDuration(),
});

/** Runs a definition (cucumber's step runner): its result, and its error if any. */
const runDefinition = async ({
  definition,
  invocationOf,
  world,
  defaultTimeout,
  uncaught,
}: {
  definition: Definition;
  invocationOf: () => Promise<Invocation>;
  world: unknown;
  defaultTimeout: number;
  uncaught: RuntimeEnvironment["uncaught"];
}): Promise<{
  result: TestStepResult;
  error?: unknown;
  failure?: { value: unknown };
}> => {
  const stop = startStopwatch();
  let error: unknown;
  let value: unknown;
  let failure: { value: unknown } | undefined;
  let invocation: Invocation | undefined;
  try {
    invocation = await invocationOf();
  } catch (invocationError) {
    error = invocationError;
    failure = { value: invocationError };
  }
  if (invocation) {
    if (invocation.validCodeLengths.includes(definition.code.length)) {
      const outcome = await runUserCode({
        args: invocation.parameters,
        thisArg: world,
        fn: definition.code,
        timeout: definition.timeout ?? defaultTimeout,
        uncaught,
      });
      error = outcome.error;
      value = outcome.result;
      failure = outcome.failure;
    } else {
      // Cucumber's message is text; the test's error, an Error of it.
      const message = invocation.invalidCodeLengthMessage();
      error = message;
      failure = { value: new Error(message) };
    }
  }
  const duration = stop();
  const hasError = error !== undefined && error !== null;
  const status =
    value === "skipped"
      ? TestStepResultStatus.SKIPPED
      : value === "pending"
        ? TestStepResultStatus.PENDING
        : hasError
          ? TestStepResultStatus.FAILED
          : TestStepResultStatus.PASSED;
  return {
    result: {
      duration,
      status,
      ...(hasError &&
        formatSimpleError(
          typeof error === "string" || error instanceof Error
            ? error
            : textOf(error),
        )),
    },
    ...(hasError && { error }),
    ...(hasError && failure && { failure }),
  };
};

/** Runs `run`'s test case (one attempt): its worst result's status, and whether it's retried. */
export const runTestCase = async (
  run: TestCaseRun,
): Promise<{ status: TestStepResultStatus; willBeRetried: boolean }> => {
  const {
    gherkinDocument,
    pickle,
    testCase,
    support,
    skip,
    newId,
    emit,
    stepOf,
    environment,
  } = run;
  const defaultTimeout = environment.defaultTimeouts.test;
  const testCaseStartedId = newId();
  let currentTestStepId: string | undefined;

  const attachments = new environment.AttachmentManager(
    ({ data, media, fileName }) => {
      if (currentTestStepId === undefined) {
        throw new Error(
          "Cannot attach when a step/hook is not running. Ensure your step/hook waits for the attach to finish.",
        );
      }
      emit({
        attachment: {
          body: data,
          contentEncoding: media.encoding,
          mediaType: media.contentType,
          ...(fileName !== undefined && { fileName }),
          testCaseStartedId,
          testStepId: currentTestStepId,
          timestamp: timestamp(),
        },
      });
    },
  );
  // The user's World or cucumber's, made with the test case's options.
  const World: WorldConstructor = support.World ?? DefaultWorld;
  const world = new World({
    // Cucumber's `attach` is overloaded (text, `Buffer`, stream); the manager implements them in one
    // signature, as cucumber's own does, which TypeScript can't match to the overloads.
    attach: attachments.create.bind(attachments) as IWorldOptions["attach"],
    log: attachments.log.bind(attachments),
    link: attachments.link.bind(attachments),
    parameters: structuredClone(run.worldParameters),
  });

  const testStepResults: TestStepResult[] = [];
  const worstResult = (): TestStepResult =>
    testStepResults.length === 0
      ? {
          status: skip
            ? TestStepResultStatus.SKIPPED
            : TestStepResultStatus.PASSED,
          duration: noDuration(),
        }
      : getWorstTestStepResult(testStepResults);
  const isSkippingSteps = () =>
    worstResult().status !== TestStepResultStatus.PASSED;
  const isExplicitlySkipped = () =>
    !skip && worstResult().status === TestStepResultStatus.SKIPPED;

  /** The running test step's failures (its definitions' real errors: `./failures.ts`). */
  let failures: unknown[] = [];

  /**
   * Runs one of the test case's definitions, keeping its failure with the running test step's; a
   * step's inside the platform's `around`, with its `label` (`RuntimeEnvironment["around"]`).
   */
  const invoke = async (
    definition: Definition,
    invocationOf: () => Promise<Invocation>,
    label?: string,
  ) => {
    // Cucumber's `world` is the test case's while its definitions run (their arguments' too).
    const call = () =>
      environment.scope.withWorld(world, () =>
        runDefinition({
          definition,
          invocationOf,
          world,
          defaultTimeout,
          uncaught: environment.uncaught,
        }),
      );
    const outcome = await (label !== undefined && environment.around
      ? environment.around(label, call)
      : call());
    if (outcome.failure) {
      failures.push(outcome.failure.value);
    }
    return outcome;
  };

  /** The step hooks that apply to the pickle (by its tags), in cucumber's order. */
  const tagNames = pickle.tags.map(({ name }) => name);
  const applying = (hooks: readonly StepHook[]) =>
    hooks.filter(({ tags }) => !tags || tags.evaluate(tagNames));
  const beforeStepHooks = applying(support.beforeStepHooks);
  const afterStepHooks = applying([...support.afterStepHooks].reverse());

  const runStepHooks = async (
    testStepId: string,
    hooks: readonly StepHook[],
    pickleStep: PickleStep,
    stepResult?: { result: TestStepResult; error?: unknown },
  ) => {
    const hookParameter = {
      gherkinDocument,
      pickle,
      pickleStep,
      testCaseStartedId,
      testStepId,
      result: stepResult?.result,
      error: stepResult?.error,
    };
    const results: TestStepResult[] = [];
    for (const hook of hooks) {
      const { result } = await invoke(hook, async () =>
        hookInvocation(hook.code, hookParameter),
      );
      results.push(result);
    }
    return results;
  };

  const runStep = async (
    testStep: AssembledTestStep,
    pickleStep: PickleStep,
  ): Promise<{ result: TestStepResult; error?: unknown }> => {
    if (isExplicitlySkipped()) {
      return { result: skipped() };
    }
    const prepared = testStep.prepare();
    if (prepared.type === "undefined") {
      emit({
        suggestion: makeSuggestion({
          newId,
          generator: support.library.getExpressionGenerator(),
          pickleStep,
        }),
      });
      return {
        result: {
          status: TestStepResultStatus.UNDEFINED,
          duration: noDuration(),
        },
      };
    }
    if (prepared.type === "ambiguous") {
      return {
        result: {
          status: TestStepResultStatus.AMBIGUOUS,
          duration: noDuration(),
        },
      };
    }
    if (isSkippingSteps()) {
      return { result: skipped() };
    }
    const definition = support.definitionOf(prepared.fn);
    let stepResults = await runStepHooks(
      testStep.id,
      beforeStepHooks,
      pickleStep,
    );
    let stepResult: { result: TestStepResult; error?: unknown } | undefined;
    if (
      getWorstTestStepResult(stepResults).status !== TestStepResultStatus.FAILED
    ) {
      stepResult = await invoke(
        definition,
        async () => {
          const parameters = await Promise.all(
            prepared.args.map((arg) => arg.getValue(world)),
          );
          parameters.push(
            ...prepared.stepArguments.map((argument) =>
              "rows" in argument ? new DataTable(argument) : argument.content,
            ),
          );
          return {
            parameters,
            validCodeLengths: [parameters.length, parameters.length + 1],
            invalidCodeLengthMessage: () =>
              invalidCodeLength(
                definition.code,
                parameters.length,
                parameters.length + 1,
              ),
          };
        },
        `${stepOf(pickleStep)?.keyword ?? ""}${pickleStep.text}`,
      );
      stepResults.push(stepResult.result);
    }
    stepResults = stepResults.concat(
      await runStepHooks(testStep.id, afterStepHooks, pickleStep, stepResult),
    );
    const finalStepResult = getWorstTestStepResult(stepResults);
    finalStepResult.duration = stepResults.reduce(
      (total, { duration }) => TimeConversion.addDurations(total, duration),
      noDuration(),
    );
    return {
      result: finalStepResult,
      ...(stepResult && "error" in stepResult && { error: stepResult.error }),
    };
  };

  /** Cucumber's: retried only if its worst status is FAILED, and attempts remain. */
  const willBeRetried = () =>
    worstResult().status === TestStepResultStatus.FAILED &&
    run.moreAttemptsRemaining;

  emit({
    testCaseStarted: {
      attempt: run.attempt,
      testCaseId: testCase.id,
      id: testCaseStartedId,
      timestamp: timestamp(),
      workerId: run.workerId,
    },
  });
  // Whether a hook is a Before or After one: before the first step, or after it.
  let didWeRunStepsYet = false;
  let error: unknown;
  try {
    for (const testStep of testCase.testSteps) {
      const message = testStep.toMessage();
      emit({
        testStepStarted: {
          testCaseStartedId,
          testStepId: testStep.id,
          timestamp: timestamp(),
        },
      });
      failures = [];
      currentTestStepId = testStep.id;
      let testStepResult: TestStepResult;
      if (message.hookId !== undefined) {
        const hookParameter = {
          gherkinDocument,
          pickle,
          testCaseStartedId,
          ...(didWeRunStepsYet && {
            result: worstResult(),
            error,
            willBeRetried: willBeRetried(),
          }),
        };
        const isBeforeHook = !didWeRunStepsYet;
        if (skip || (isSkippingSteps() && isBeforeHook)) {
          testStepResult = skipped();
        } else {
          const prepared = testStep.prepare();
          // A hook's step is always prepared (only a pickle's step can be undefined or ambiguous).
          if (prepared.type !== "prepared") {
            throw pluginError(`a hook's step that is ${prepared.type}`, {
              internal: true,
            });
          }
          const definition = support.definitionOf(prepared.fn);
          ({ result: testStepResult } = await invoke(definition, async () =>
            hookInvocation(definition.code, hookParameter),
          ));
        }
      } else {
        const pickleStep = pickle.steps.find(
          ({ id }) => id === message.pickleStepId,
        );
        if (!pickleStep) {
          throw pluginError("a test step of a step its pickle hasn't", {
            internal: true,
          });
        }
        const outcome = await runStep(testStep, pickleStep);
        didWeRunStepsYet = true;
        error = outcome.error;
        testStepResult = outcome.result;
      }
      currentTestStepId = undefined;
      testStepResults.push(testStepResult);
      emit({
        testStepFinished: {
          testCaseStartedId,
          testStepId: testStep.id,
          testStepResult: withFailures(testStepResult, failures),
          timestamp: timestamp(),
        },
      });
    }
  } finally {
    currentTestStepId = undefined;
    environment.scope.endTestCase();
  }
  const retried = willBeRetried();
  emit({
    testCaseFinished: {
      testCaseStartedId,
      timestamp: timestamp(),
      willBeRetried: retried,
    },
  });
  return { status: worstResult().status, willBeRetried: retried };
};
