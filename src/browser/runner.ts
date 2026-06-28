/**
 * Browser-realm runner — the symmetric counterpart of the Node `runner.ts`.
 *
 * Runs inside the browser test realm (real DOM, real step imports, the World).
 * `runFeatureFile` is invoked by the transformed `.feature` (the plugin emits a
 * thin wrapper). It asks the Node-side commands (see `commands.ts`) for the
 * scenario plan (a dry run), registers one Vitest test per scenario via the
 * shared `registerFeatureTests`, then drives a single pull loop for the whole
 * feature: Node orchestrates the native Cucumber runtime and dispatches each
 * step/hook body back here to execute in the page, while streaming each
 * scenario's finished result back as a `testCaseFinished` task — the browser
 * analogue of the Node runner's `onTestCaseFinished`.
 */

import { afterAll } from "vitest";
import { commands } from "vitest/browser";
import { globalRef } from "../utils/globals.ts";
import { registerFeatureTests } from "../utils/registerFeatureTests.ts";
import type { ResultItem } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import { serializeError } from "../utils/serializeError.ts";
import type { ChannelTask } from "./channel.ts";
import type { CucumberCommands } from "./commands.ts";
import type {
  BrowserAttachment,
  BrowserBridge,
  HookArg,
} from "./cucumberShim.ts";

const cucumber = commands as unknown as CucumberCommands;

// The shim's invocation API, installed on globalThis. Read at call time (not
// module load) so the shim has registered it by the time tasks run.
const bridge = () =>
  globalRef.__vitest_cucumber_browser__?.bridge as BrowserBridge;

// Execute a task in the page. Step/hook/testRunHook bodies are run by the shim,
// which catches internally and resolves with a { value | error } object — it
// never rejects, so a failing body can't leak as an unhandled rejection.
const runTask = async (
  task: ChannelTask,
): Promise<{
  value?: unknown;
  err?: SerializedError;
  attachments?: BrowserAttachment[];
  hookResult?: unknown;
  hookError?: SerializedError;
}> => {
  try {
    switch (task.kind) {
      case "getSteps":
        return { value: bridge().getSteps() };
      case "getHooks":
        return { value: bridge().getHooks() };
      case "getTestRunHooks":
        return { value: bridge().getTestRunHooks() };
      case "getParameterTypes":
        return { value: bridge().getParameterTypes() };
      case "getDefaultTimeout":
        return { value: bridge().getDefaultTimeout() };
      case "newWorld":
        return { value: bridge().newWorld(task.payload) };
      case "step": {
        const { pattern, args } = task.payload as {
          pattern: string;
          args: unknown[];
        };
        return await bridge().runStep(pattern, args);
      }
      case "hook": {
        const { kind, index, arg } = task.payload as {
          kind: "before" | "after" | "beforeStep" | "afterStep";
          index: number;
          arg: HookArg;
        };
        return await bridge().runHook(kind, index, arg);
      }
      case "testRunHook": {
        const { kind, index, parameters } = task.payload as {
          kind: "beforeAll" | "afterAll";
          index: number;
          parameters: unknown;
        };
        return await bridge().runTestRunHook(kind, index, parameters);
      }
      case "transform": {
        const { name, groups } = task.payload as {
          name: string;
          groups: string[];
        };
        return await bridge().runTransform(name, groups);
      }
      default:
        return { value: undefined };
    }
  } catch (err) {
    return { err: serializeError(err) };
  }
};

// Pull tasks from the channel and execute each in the page until the channel
// finishes. `testCaseFinished` tasks carry a finished scenario's result (handed
// to `onTestCaseFinished` so its test resolves at once); all other tasks run
// their step/hook body, replay any attachments it produced, and report the
// value back to Node.
const pump = async (
  onTestCaseFinished?: (finished: ResultItem) => void,
): Promise<void> => {
  for (
    let task = await cucumber.cucumberNextTask();
    task;
    task = await cucumber.cucumberNextTask()
  ) {
    if (task.kind === "testCaseFinished") {
      onTestCaseFinished?.(task.payload as ResultItem);
      await cucumber.cucumberReportTask(task.id, {});
      continue;
    }
    // Run the body WITHOUT blocking the loop. Cucumber dispatches serially — it
    // doesn't queue the next task until this one reports — so the next
    // `cucumberNextTask()` normally parks on an empty queue and the loop stays
    // effectively serial (one body at a time). The exception is a step Cucumber
    // has TIMED OUT: it moves on and dispatches the next task while this body is
    // still running, and a blocking `await` here would stall the whole feature.
    // Fire-and-forget lets the loop service that next task, so Cucumber's native
    // step timeout takes effect in the browser. The orphaned timed-out body keeps
    // running (JS can't cancel it); its late report is keyed by id and harmless.
    const current = task;
    void (async () => {
      const outcome = await runTask(current);
      // Replay attachments first so Node emits them while the step is still in
      // flight (before the report resolves it).
      for (const attachment of outcome.attachments ?? []) {
        await cucumber.cucumberAttach(attachment);
      }
      // A hook body may mutate its parameter in place; fold the post-run result/
      // error into the reported value so the Node proxy can re-apply them.
      const result =
        current.kind === "hook"
          ? {
              value: outcome.value,
              hookResult: outcome.hookResult,
              hookError: outcome.hookError,
            }
          : outcome.value;
      await cucumber.cucumberReportTask(current.id, {
        result,
        err: outcome.err,
      });
    })().catch(() => {});
  }
};

const worker = globalRef.__vitest_worker__;

// Whether BeforeAll has already fired in THIS browser realm. Module-scoped, so
// it resets with the realm (isolate: true → per feature file) or persists across
// features (isolate: false → once per worker) — matching where the support and
// the World/lifecycle state load, exactly like the node runner self-adjusts.
let beforeAllDone = false;

export const runFeatureFile = async ({
  id,
  lifecycleFeaturePath,
}: {
  id: string;
  lifecycleFeaturePath: string;
  // Eager glob of step/support modules — imported for their registration side
  // effects by the plugin wrapper; nothing to consume here.
  steps?: Record<string, unknown>;
}): Promise<void> => {
  const testLocations = worker?.ctx?.files?.find(
    (file) => file?.filepath === id,
  )?.testLocations;

  await cucumber.cucumberRun({
    id,
    dispatchTestCaseFinished: false,
    withHook: "none",
    runtime: { dryRun: true },
    testLocations,
  });
  await pump();
  const { featureName, results: planResults } = await cucumber.cucumberEnd();

  // The first feature of this realm runs BeforeAll and registers the realm's
  // AfterAll teardown; later features in the same realm skip both.
  const firstInRealm = !beforeAllDone;
  beforeAllDone = true;

  if (firstInRealm) {
    worker?.onCleanup?.(async () => {
      await cucumber.cucumberRun({
        id: lifecycleFeaturePath,
        dispatchTestCaseFinished: false,
        withHook: "after",
      });
      await pump();
      await cucumber.cucumberEnd();
    });
  }

  const results = new Map<string, ResultItem>(
    planResults.map((result) => [
      result.id,
      { ...result, status: undefined, resolvers: Promise.withResolvers() },
    ]),
  );

  registerFeatureTests({ id, featureName, results });

  // RUN: the real feature run. BeforeAll fires on the first feature of the realm;
  // step/hook bodies execute here via the pull loop, and each scenario's result
  // streams back as it finishes so its test resolves progressively (not batched
  // at the end of the feature).

  const withHook = firstInRealm ? "before" : "none";

  const runPromise = (async () => {
    await cucumber.cucumberRun({
      id,
      dispatchTestCaseFinished: true,
      withHook,
      testLocations,
    });
    await pump((finished) => {
      const result = results.get(finished.id);
      if (result) {
        Object.assign(result, finished);
        result.resolvers?.resolve(null);
      }
    });
    await cucumber.cucumberEnd();
  })().finally(() => {
    for (const result of results.values()) {
      result.resolvers?.resolve(null);
    }
  });

  afterAll(async () => {
    await runPromise;
  });
};
