/**
 * Node-side Vitest commands backing browser mode.
 *
 * The transformed `.feature` (see `runnerBrowser.ts`, which runs in the browser
 * realm) calls these over Vitest's command channel. They run the native
 * `@cucumber/cucumber` runtime in Node; each step/hook body executes back in the
 * browser test realm (its real imports + the World live there) via a pull loop.
 * The bridge uses Vitest commands only — no browser-provider API — so it is
 * provider agnostic (playwright, webdriverio, preview).
 */

import { version as cucumberVersion } from "@cucumber/cucumber";
import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BrowserCommand } from "vitest/node";
import type { WithHook } from "../utils/config.ts";
import { mergeConfig, prepareRunConfiguration } from "../utils/config.ts";
import { globalRef } from "../utils/globals.ts";
import type { ResultItem } from "../utils/runCucumber.ts";
import { runCucumber } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import type { ChannelTask } from "./channel.ts";
import { BrowserChannel } from "./channel.ts";
import {
  dispatchGetDefaultTimeout,
  dispatchGetHooks,
  dispatchGetParameterTypes,
  dispatchGetSteps,
  dispatchGetTestRunHooks,
  runWithChannel,
} from "./taskBridge.ts";

const ext = path.extname(import.meta.filename);
const silentFormatter = path.join(
  import.meta.dirname,
  "..",
  "utils",
  `silentFormatter${ext}`,
);
const loadSupportPath = path.join(import.meta.dirname, `loadSupport${ext}`);
const lifecycleFeaturePath = path.join(
  import.meta.dirname,
  "..",
  "features",
  "lifecycle.feature",
);

// Options for a `cucumberRun` call, supplied by the browser runner: the feature
// to run (`id`), which test-run hooks to fire (`withHook`), whether to stream
// each finished scenario back as a `testCaseFinished` task (`dispatchTestCaseFinished`
// — only the real run does), optional Cucumber runtime overrides (e.g. the
// dry-run plan), and the optional line filter. Passing them in one object keeps
// any `undefined` out of the positional command args (Vitest's command RPC
// drops a middle `undefined`).
export type RunOptions = {
  id: string;
  dispatchTestCaseFinished: boolean;
  withHook: WithHook;
  runtime?: Partial<Pick<IRunConfiguration["runtime"], "dryRun" | "retry">>;
  testLocations?: number[];
};

// The command surface the browser-side `runFeatureFile` calls.
export interface CucumberCommands {
  cucumberMetadata(): Promise<{
    version: string;
    lifecycleFeaturePath: string;
  }>;
  cucumberRun(options: RunOptions): Promise<void>;
  cucumberNextTask(): Promise<ChannelTask | null>;
  cucumberReportTask(outcome: {
    taskId: string;
    result?: unknown;
    err?: SerializedError;
  }): Promise<void>;
  cucumberEnd(): Promise<{
    featureName: string;
    results: ResultItem[];
  }>;
}

// One channel + in-flight run per browser session (test file). The run promise
// resolves to the feature name + scenario results (surfaced by `cucumberEnd`).
const channels = new Map<string, BrowserChannel>();
const runs = new Map<
  string,
  Promise<{ featureName: string; results: ResultItem[] }>
>();
type SharedSupport = {
  runConfiguration: IRunConfiguration;
  support: ISupportCodeLibrary;
  testStepErrors: Map<string, SerializedError>;
};
// The Node support library (the step/hook/param-type proxies) is identical for
// every browser feature file in a project — they all load the same support glob
// — so it is built ONCE and shared across sessions. Per-session rebuilds are
// impossible anyway: Cucumber's loadSupport imports `loadSupport.ts` for its
// registration side effects, and ESM evaluates a module only once, so only the
// first build would register anything. A promise (not the value) is cached so
// concurrent sessions await the same build instead of racing it.
let sharedSupport: Promise<SharedSupport> | undefined;
const getChannel = (sessionId: string): BrowserChannel => {
  let channel = channels.get(sessionId);
  if (!channel) {
    channel = new BrowserChannel();
    channels.set(sessionId, channel);
  }
  return channel;
};

export const createCucumberCommands = (config: Partial<IConfiguration>) => {
  // Resolve the effective config (plugin config + CUCUMBER_OPTIONS), cached per
  // session so the dry-run plan and the real run share the same resolved config
  // — notably the `order: random` seed, so scenario indices line up.
  let mergedConfig: Partial<IConfiguration> | undefined;
  const getMergedConfig = (): Partial<IConfiguration> =>
    (mergedConfig ??= mergeConfig(config));

  // Builds the native support library once for the whole project: fetches the
  // browser's step/hook/param-type registry, then loads `loadSupport`, which
  // registers a Node proxy per definition that dispatches its body back to the
  // browser (over whichever session's channel is active for the run).
  const buildSharedSupport = async (): Promise<SharedSupport> => {
    const testStepErrors = new Map<string, SerializedError>();
    // Ask the browser (sequentially — single-slot channel) for its registry.
    const steps = await dispatchGetSteps();
    const hooks = await dispatchGetHooks();
    const testRunHooks = await dispatchGetTestRunHooks();
    const parameterTypes = await dispatchGetParameterTypes();
    const defaultTimeout = await dispatchGetDefaultTimeout();

    const { runConfiguration } = await loadConfiguration({
      provided: {
        format: [`"${pathToFileURL(silentFormatter).toString()}"`],
        ...getMergedConfig(),
        paths: [],
        import: [loadSupportPath],
        require: [],
      },
    });
    globalRef.__vitest_cucumber_browser__ ??= {};
    globalRef.__vitest_cucumber_browser__.support = {
      steps,
      hooks,
      testRunHooks,
      parameterTypes,
      defaultTimeout,
      testStepErrors,
    };
    const support = await loadSupport(runConfiguration).finally(() => {
      delete globalRef.__vitest_cucumber_browser__?.support;
    });
    return { runConfiguration, support, testStepErrors };
  };

  // The shared support library, built once for the whole project. BeforeAll/
  // AfterAll firing is decided in the browser realm (see runner.ts) so it self-
  // adjusts with `isolate`, so the command no longer tracks per-feature state.
  const ensureSupport = (): Promise<SharedSupport> =>
    (sharedSupport ??= buildSharedSupport());

  // Single driver for every run a session makes — the dry-run plan, the real
  // feature run, and the AfterAll teardown (which the browser drives by passing
  // the lifecycle feature as `id` with `withHook: "after"`). The shared support
  // library is built once and reused; the browser realm decides when BeforeAll/
  // AfterAll fire (via `withHook`), so it self-adjusts with `isolate`.
  // When `dispatchTestCaseFinished` is set (the real run), each finished
  // scenario streams back as a `testCaseFinished` task so its test resolves
  // progressively; the dry-run plan leaves it off and reads the returned
  // `results` instead. Always resolves to { featureName, results }; the channel
  // is always finished so the browser pull loop terminates.
  const run = async (
    channel: BrowserChannel,
    options: RunOptions,
  ): Promise<{
    featureName: string;
    results: ResultItem[];
  }> => {
    try {
      const { id, dispatchTestCaseFinished, withHook, runtime, testLocations } =
        options;

      const cached = await ensureSupport();

      const { featureName, results } = await runCucumber({
        id,
        runConfiguration: prepareRunConfiguration({
          id,
          runConfiguration: cached.runConfiguration,
          support: cached.support,
          withHook,
          runtime,
          testLocations,
        }),
        testStepErrors: cached.testStepErrors,
        onTestCaseFinished: dispatchTestCaseFinished
          ? (result) => {
              void channel.dispatch("testCaseFinished", result);
            }
          : undefined,
      });

      return { featureName, results: [...results.values()] };
    } finally {
      channel.finish();
    }
  };

  // Kicks off a run and returns immediately so the browser's pull loop (which
  // shares the per-session command queue) isn't starved. The browser pumps the
  // channel, then awaits `cucumberEnd` for the results and any runtime/hook
  // error.
  const cucumberRun: BrowserCommand<[RunOptions], void> = (ctx, options) => {
    const channel = getChannel(ctx.sessionId);
    runs.set(
      ctx.sessionId,
      runWithChannel(channel, () => run(channel, options)),
    );
  };

  const cucumberNextTask: BrowserCommand<[], ChannelTask | null> = (ctx) =>
    getChannel(ctx.sessionId).next();

  const cucumberReportTask: BrowserCommand<
    [{ taskId: string; result?: unknown; err?: SerializedError }],
    void
  > = (ctx, outcome) => {
    getChannel(ctx.sessionId).report(
      outcome.taskId,
      outcome.result,
      outcome.err,
    );
  };

  // Cucumber facts the page can't compute (Node-only): the installed runtime
  // version (mirrored into the shim) and the lifecycle feature path (used as the
  // AfterAll teardown's feature id). Fetched once before the run.
  const cucumberMetadata: BrowserCommand<
    [],
    { version: string; lifecycleFeaturePath: string }
  > = () => ({ version: cucumberVersion, lifecycleFeaturePath });

  // Awaits the in-flight run to surface its feature name + scenario results and
  // any Cucumber runtime/hook error, then cleans up the session's channel.
  const cucumberEnd: BrowserCommand<
    [],
    { featureName: string; results: ResultItem[] }
  > = async (ctx) => {
    const runPromise = runs.get(ctx.sessionId);
    if (!runPromise) {
      throw new Error(
        `cucumberEnd called with no in-flight run for session ${ctx.sessionId}`,
      );
    }
    try {
      return await runPromise;
    } finally {
      runs.delete(ctx.sessionId);
      channels.delete(ctx.sessionId);
    }
  };

  return {
    cucumberMetadata,
    cucumberRun,
    cucumberNextTask,
    cucumberReportTask,
    cucumberEnd,
  };
};
