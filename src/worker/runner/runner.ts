// The plugin's cucumber runs, as cucumber's executor runs them (a port of 13.3.0's
// `lib/runtime/executor.ts`): a run is the BeforeAll hooks, one scenario (a pickle, as
// `@cucumber/core` makes its test case: `./testCaseRunner.ts`), or the AfterAll hooks (in
// reverse); a dry run as the options say. Its outcome is the runtime's `Run`: its success (cucumber's `shouldCauseFailure`: a dry
// run never fails, `PENDING` only with `strict`; a hook run, every hook passed), its messages (the
// support code's, the feature's, the run's), each failure's real error on its message
// (`./failures.ts`). A run hook gets cucumber's context, `{ parameters }` (the world parameters
// themselves), as `this` and `context`. A scenario run that throws (e.g. a World's constructor) fails
// as cucumber's run does: its `testRunFinished` has the error as its `exception`. What it takes from
// its platform is `environment` (`../../types/runtimeEnvironment.ts`). Page-safe.
import {
  makeTestPlan,
  type DefinedTestRunHook,
  type AssembledTestCase as TestCase,
} from "@cucumber/core";
import {
  TestStepResultStatus,
  type Envelope,
  type GherkinDocument,
  type Pickle,
  type TestStepResult,
} from "@cucumber/messages";
import type { RunOptions } from "../../types/feature.ts";
import type { Run } from "../../types/platform.ts";
import type { RuntimeEnvironment } from "../../types/runtimeEnvironment.ts";
import type { SupportCode } from "../../types/supportCode.ts";
import { pluginError } from "../../utils/errors.ts";
import { useScope } from "../cucumber/scope.ts";
import { noDuration, startStopwatch, timestamp } from "./clock.ts";
import { withFailures } from "./failures.ts";
import { formatSimpleError } from "./formatError.ts";
import { createQuery } from "./query.ts";
import { runTestCase } from "./testCaseRunner.ts";
import { errorOf, runUserCode } from "./userCode.ts";

/** Cucumber's `shouldCauseFailure`. */
const shouldCauseFailure = (
  status: TestStepResultStatus,
  { dryRun, strict }: { dryRun: boolean; strict: boolean },
) => {
  if (dryRun) {
    return false;
  }
  const failureStatuses: string[] = [
    TestStepResultStatus.AMBIGUOUS,
    TestStepResultStatus.FAILED,
    TestStepResultStatus.UNDEFINED,
  ];
  if (strict) {
    failureStatuses.push(TestStepResultStatus.PENDING);
  }
  return failureStatuses.includes(status);
};

export const createRunner = ({
  support,
  newId,
  options,
  workerId,
  environment,
}: {
  support: SupportCode;
  newId: () => string;
  options: RunOptions;
  workerId: string;
  environment: RuntimeEnvironment;
}) => {
  // `world` and `context` read the platform's scope.
  useScope(environment.scope);
  const defaultTimeout = environment.defaultTimeouts.hook;
  const { worldParameters, strict, dryRun } = options;

  /** Runs a BeforeAll or AfterAll hook (cucumber's `runTestRunHook`): whether it didn't fail. */
  const runTestRunHook = async (
    hook: DefinedTestRunHook,
    {
      label,
      emit,
    }: {
      /** `BeforeAll` or `AfterAll` (`RuntimeEnvironment["around"]`). */
      label: string;
      emit: (envelope: Envelope) => void;
    },
  ) => {
    const testRunHookStartedId = newId();
    // Every message's run id: none (main's stream has one run at a time, `""` there too).
    emit({
      testRunHookStarted: {
        testRunStartedId: "",
        workerId,
        id: testRunHookStartedId,
        hookId: hook.id,
        timestamp: timestamp(),
      },
    });
    let result: TestStepResult;
    if (dryRun) {
      result = { duration: noDuration(), status: TestStepResultStatus.SKIPPED };
    } else {
      const definition = support.definitionOf(hook.fn);
      const stop = startStopwatch();
      const context = { parameters: worldParameters };
      const call = () =>
        environment.scope.withContext(context, () =>
          runUserCode({
            // Its context, if its code takes it as an argument (`./thisFirst.ts`).
            args: definition.thisFirst ? [context] : [],
            thisArg: context,
            fn: definition.code,
            timeout: definition.timeout ?? defaultTimeout,
            uncaught: environment.uncaught,
          }),
        );
      const { error, failure } = await (environment.around
        ? environment.around(label, call)
        : call());
      const duration = stop();
      if (error !== undefined) {
        result = withFailures(
          {
            duration,
            status: TestStepResultStatus.FAILED,
            ...formatSimpleError(error),
          },
          failure ? [failure.value] : [],
        );
      } else {
        result = { duration, status: TestStepResultStatus.PASSED };
      }
    }
    emit({
      testRunHookFinished: {
        testRunHookStartedId,
        result,
        timestamp: timestamp(),
      },
    });
    return result.status !== TestStepResultStatus.FAILED;
  };

  /**
   * A run's messages, on the support code's (`support.query`; failures on them: `./failures.ts`), its
   * `context` read for its lookups, not its own (a scenario's Gherkin, a retry's test case).
   */
  const startRun = (context: readonly Envelope[] = []) => {
    const query = createQuery([], { support: support.query, context });
    return { query, emit: query.update };
  };

  /** Runs the BeforeAll hooks, or the AfterAll hooks in reverse (`label`: which). */
  const runTestRunHooks = async (
    label: string,
    hooks: readonly DefinedTestRunHook[],
  ): Promise<Run> => {
    const { query, emit } = startRun();
    try {
      let success = true;
      for (const hook of hooks) {
        if (!(await runTestRunHook(hook, { label, emit }))) {
          success = false;
        }
      }
      return { success, query };
    } finally {
      // A call left running (a timed-out hook) fails nothing of the next run.
      environment.uncaught.stopAll();
    }
  };

  return {
    /** Runs the BeforeAll hooks. */
    beforeAll: () =>
      runTestRunHooks("BeforeAll", support.library.getAllBeforeAllHooks()),
    /** Runs the AfterAll hooks, in reverse. */
    afterAll: () =>
      runTestRunHooks(
        "AfterAll",
        [...support.library.getAllAfterAllHooks()].reverse(),
      ),
    /**
     * Runs one attempt of `pickle`, of `document`, as cucumber's test case runner runs an attempt:
     * a retry's test case its previous attempt's (`testCase`, sent with it), else its own, assembled.
     */
    scenario: async (
      document: GherkinDocument,
      pickle: Pickle,
      {
        attempt = 0,
        moreAttemptsRemaining = false,
        testCase: retried,
      }: {
        attempt?: number;
        moreAttemptsRemaining?: boolean;
        testCase?: TestCase;
      } = {},
    ): Promise<Run> => {
      const { query, emit } = startRun([
        { gherkinDocument: document },
        { pickle },
        ...(retried ? [{ testCase: retried.toMessage() }] : []),
      ]);
      try {
        let testCase = retried;
        if (!testCase) {
          const plan = makeTestPlan(
            {
              gherkinDocument: document,
              pickles: [pickle],
              supportCodeLibrary: support.library,
              testRunStartedId: "",
            },
            { newId },
          );
          plan.toEnvelopes().forEach(emit);
          [testCase] = plan.testCases;
        }
        if (!testCase) {
          throw pluginError("no test case for the scenario", {
            internal: true,
          });
        }
        let ran: Awaited<ReturnType<typeof runTestCase>>;
        try {
          ran = await runTestCase({
            gherkinDocument: document,
            pickle,
            testCase,
            support,
            worldParameters,
            skip: dryRun,
            newId,
            workerId,
            attempt,
            moreAttemptsRemaining,
            emit,
            stepOf: query.stepOf,
            environment,
          });
        } catch (crash) {
          emit({
            testRunFinished: withFailures(
              {
                testRunStartedId: "",
                success: false,
                timestamp: timestamp(),
                exception: formatSimpleError(errorOf(crash)).exception,
              },
              [crash],
            ),
          });
          return { success: false, query };
        }
        return {
          success: !shouldCauseFailure(ran.status, { dryRun, strict }),
          query,
          willBeRetried: ran.willBeRetried,
          testCase,
        };
      } finally {
        // A call left running (a timed-out step) fails nothing of the next run.
        environment.uncaught.stopAll();
      }
    },
  };
};
