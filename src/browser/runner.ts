import { commands } from "vitest/browser";
import { createBaseTest } from "../utils/createBaseTest.ts";
import { globalRef } from "../utils/globals.ts";
import { registerFeatureTests } from "../utils/registerFeatureTests.ts";
import type { ResultItem } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import { serializeError } from "../utils/serializeError.ts";
import type { ChannelTask } from "./channel.ts";
import type { CucumberCommands } from "./commands.ts";
import type { BrowserAttachment, BrowserBridge } from "./cucumberShim.ts";
import { setVersion } from "./cucumberShim.ts";

const cucumber = commands as unknown as CucumberCommands;

const worker = globalRef.__vitest_worker__;

// The shim's invocation API, installed on globalThis. Read at call time (not
// module load) so the shim has registered it by the time tasks run.
const bridge = () =>
  globalRef.__vitest_cucumber_browser__?.bridge as BrowserBridge;

// Module-scoped: resets with the realm (isolate: true) or persists across
// features (isolate: false) — mirrors node/runner.ts `cached`/`isCached`.
let cached: { lifecycleFeaturePath: string } | null = null;

// Always resolves (never rejects) so a failing body can't leak as an unhandled rejection.
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
      case "getRegistry":
        return { value: bridge().getRegistry() };
      case "newWorld":
        return { value: bridge().newWorld(task.payload) };
      case "step": {
        const { pattern, args } = task.payload;
        return await bridge().runStep(pattern, args);
      }
      case "hook": {
        const { kind, index, arg } = task.payload;
        return await bridge().runHook(kind, index, arg);
      }
      case "testRunHook": {
        const { kind, index, parameters } = task.payload;
        return await bridge().runTestRunHook(kind, index, parameters);
      }
      case "transform": {
        const { name, groups } = task.payload;
        return await bridge().runTransform(name, groups);
      }
      default:
        return { value: undefined };
    }
  } catch (err) {
    return { err: serializeError(err) };
  }
};

// Pull tasks until the channel finishes. `testCaseFinished` resolves the test;
// all other tasks run the body and report back to Node.
const pump = async (
  onTestCaseFinished?: (finished: ResultItem) => void,
): Promise<void> => {
  for (
    let task = await cucumber.cucumberNextTask();
    task;
    task = await cucumber.cucumberNextTask()
  ) {
    if (task.kind === "testCaseFinished") {
      onTestCaseFinished?.(task.payload);
      await cucumber.cucumberReportTask({ taskId: task.id });
      continue;
    }
    // Fire-and-forget: Cucumber is normally serial (no next task until this
    // reports), but a timed-out step dispatches the next task while the body is
    // still running. Blocking here would stall the feature; fire-and-forget lets
    // the loop service it. The late report from the orphaned body is harmless.
    const current = task;
    void (async () => {
      const outcome = await runTask(current);
    // Bodies report the whole BodyResult so Node can replay attachments and
    // re-apply hook mutations in scope. Other tasks just return their value.
      const isBody = current.kind === "step" || current.kind === "hook";
      await cucumber.cucumberReportTask({
        taskId: current.id,
        result: isBody ? outcome : outcome.value,
        err: outcome.err,
      });
    })().catch(() => {});
  }
};

const ensureCache = async () => {
  if (cached) {
    return { isCached: true };
  }

  const { version, lifecycleFeaturePath } = await cucumber.cucumberMetadata();

  setVersion(version);

  cached = {
    lifecycleFeaturePath,
  };

  return { isCached: false };
};

const test = createBaseTest({
  onCleanup: async () => {
    if (!cached) {
      throw new Error("ensureCache was not called");
    }
    await cucumber.cucumberRun({
      id: cached.lifecycleFeaturePath,
      dispatchTestCaseFinished: false,
      withHook: "after",
    });
    await pump();
    await cucumber.cucumberEnd();
  },
});

export const runFeatureFile = async ({
  id,
}: {
  id: string;
  // Eager glob of step/support modules — imported for their registration side
  // effects by the plugin wrapper; nothing to consume here.
  steps?: Record<string, unknown>;
}): Promise<void> => {
  const testLocations = worker?.ctx?.files?.find(
    (file) => file?.filepath === id,
  )?.testLocations;

  const { isCached } = await ensureCache();

  await cucumber.cucumberRun({
    id,
    dispatchTestCaseFinished: false,
    withHook: "none",
    runtime: { dryRun: true },
    testLocations,
  });
  await pump();
  const { featureName, results: planResults } = await cucumber.cucumberEnd();

  const results = new Map<string, ResultItem>(
    planResults.map((result) => [
      result.id,
      { ...result, status: undefined, resolvers: Promise.withResolvers() },
    ]),
  );

  registerFeatureTests({
    id,
    featureName,
    results,
    test,
  });

  const withHook = isCached ? "none" : "before"; // first feature keeps BeforeAll

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

  test.afterAll(async () => {
    await runPromise;
  });
};
