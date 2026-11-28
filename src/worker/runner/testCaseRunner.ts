// One test case, run as cucumber's test case runner runs one attempt (a port of 13.3.0's
// `lib/runtime/test_case_runner.ts`, with its `step_runner.ts`): a World per test case (its `attach`,
// `log` and `link` emit attachments while a step or hook runs, its parameters a clone of the world
// parameters), then each test step in order with its messages (`testStepStarted`, `testStepFinished`).
// Once a result isn't `PASSED`, later steps are skipped and Before hooks too, After hooks still run
// (they get the worst result so far). A hook's `result` (an After hook's, an AfterStep hook's) is a
// copy of its own (the user's call, 2026-11-28): cucumber hands over the recorded result itself, so
// a hook that writes to it changes the run's verdict but not what was already reported (and in
// parallel runs not even the reports), which its maintainers don't support (cucumber-js#1724:
// "rewrite history doesn't seem workable"). Here a hook reads it, and shares what it needs through
// the World.
// A step runs between the `BeforeStep` hooks that apply (by tags) and the `AfterStep` hooks (in
// reverse), unless a BeforeStep hook failed. Each definition gets cucumber's parameters (a step: its
// arguments' values, then its data table or doc string; a hook: its hook parameter), after the World
// if its code takes it as its first argument (`./thisFirst.ts`), and its arity
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
import { errorOf, runUserCode, type UserCodeOutcome } from "./userCode.ts";

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

/**
 * What a definition gets, and how many of them its code may take if it's synchronous or returns a
 * promise (`lengths`; one more than the last: with cucumber's callback), as cucumber's
 * `getInvocationParameters` has them.
 */
interface Invocation {
  parameters: unknown[];
  lengths: number[];
}

/** A hook's invocation: its hook parameter; 0 or 1 arguments, or 2 with a callback. */
const hookInvocation = (hookParameter: object): Invocation => ({
  parameters: [hookParameter],
  lengths: [0, 1],
});

/**
 * The arguments `definition`'s code is called with for `invocation`, and the lengths it may have:
 * cucumber's, or each with the World before them, one more (`./thisFirst.ts`).
 */
const callOf = (
  { code, thisFirst }: Definition,
  { parameters, lengths }: Invocation,
  world: unknown,
) => {
  const first = thisFirst ? 1 : 0;
  const sync = lengths.map((length) => length + first);
  const callback = Math.max(...sync) + 1;
  return {
    args: thisFirst ? [world, ...parameters] : parameters,
    valid: [...sync, callback].includes(code.length),
    /** Cucumber's `buildInvalidCodeLengthMessage`; with the World, saying it's counted. */
    invalidCodeLengthMessage: () =>
      `function has ${String(code.length)} arguments, should have ${sync.join(" or ")} (if synchronous or returning a promise) or ${String(callback)} (if accepting a callback)${thisFirst ? ", the world counted" : ""}`,
  };
};

const skipped = (): TestStepResult => ({
  status: TestStepResultStatus.SKIPPED,
  duration: noDuration(),
});

/** A definition to run: its code's arguments (`invocationOf`), its World, its timeout's default. */
interface DefinitionCall {
  definition: Definition;
  invocationOf: () => Invocation | Promise<Invocation>;
  world: unknown;
  defaultTimeout: number;
  uncaught: RuntimeEnvironment["uncaught"];
}

/** Calls a definition's code with its arguments: what it did (`./userCode.ts`). */
const callDefinition = async ({
  definition,
  invocationOf,
  world,
  defaultTimeout,
  uncaught,
}: DefinitionCall): Promise<UserCodeOutcome> => {
  let invocation: Invocation;
  try {
    invocation = await invocationOf();
  } catch (thrown) {
    // Whatever a parameter type's transformer throws fails the step, `null` and `undefined` too (as
    // their text, as the step's own code throwing them: cucumber's check reads them as no error).
    return { error: errorOf(thrown), failure: { value: thrown } };
  }
  const { args, valid, invalidCodeLengthMessage } = callOf(
    definition,
    invocation,
    world,
  );
  if (!valid) {
    // Cucumber's message is text; the test's error, an Error of it.
    const message = invalidCodeLengthMessage();
    return { error: message, failure: { value: new Error(message) } };
  }
  return runUserCode({
    args,
    thisArg: world,
    fn: definition.code,
    timeout: definition.timeout ?? defaultTimeout,
    uncaught,
  });
};

/** A definition run: its result, and, failed, its error (cucumber's) with the real failure. */
type DefinitionOutcome =
  | { result: TestStepResult; failure?: undefined }
  | {
      result: TestStepResult;
      error: Error | string;
      failure: { value: unknown };
    };

/** Runs a definition (cucumber's step runner): its result, and its error if it failed. */
const runDefinition = async (
  call: DefinitionCall,
): Promise<DefinitionOutcome> => {
  const stop = startStopwatch();
  const ran = await callDefinition(call);
  const duration = stop();
  if (ran.failure) {
    return {
      result: {
        duration,
        status: TestStepResultStatus.FAILED,
        ...formatSimpleError(ran.error),
      },
      ...ran,
    };
  }
  return {
    result: {
      duration,
      status:
        ran.result === "skipped"
          ? TestStepResultStatus.SKIPPED
          : ran.result === "pending"
            ? TestStepResultStatus.PENDING
            : TestStepResultStatus.PASSED,
    },
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
    invocationOf: DefinitionCall["invocationOf"],
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

  /** A result as a hook gets it: a copy of its own, nothing the hook writes reaching the run. */
  const resultForHook = (result: TestStepResult | undefined) =>
    result && structuredClone(result);

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
      const { result } = await invoke(hook, () =>
        hookInvocation({
          ...hookParameter,
          result: resultForHook(hookParameter.result),
        }),
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
          return { parameters, lengths: [parameters.length] };
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
            result: resultForHook(worstResult()),
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
          ({ result: testStepResult } = await invoke(definition, () =>
            hookInvocation(hookParameter),
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
