import { version as cucumberVersion } from "@cucumber/cucumber";
import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadSupport } from "@cucumber/cucumber/api";
import path from "node:path";
import type { BrowserCommand } from "vitest/node";
import type { WithHook } from "../utils/config.ts";
import {
  prepareRunConfiguration,
  resolveRunConfiguration,
} from "../utils/config.ts";
import { globalRef } from "../utils/globals.ts";
import { isPublishEnabled, writeEnvelopes } from "../utils/publish.ts";
import type { ResultItem } from "../utils/runCucumber.ts";
import { runCucumber } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import type { ChannelTask } from "./channel.ts";
import { BrowserChannel } from "./channel.ts";
import { dispatchGetRegistry, runWithChannel } from "./taskBridge.ts";

const ext = path.extname(import.meta.filename);
const loadSupportPath = path.join(import.meta.dirname, `loadSupport${ext}`);
const lifecycleFeaturePath = path.join(
  import.meta.dirname,
  "..",
  "features",
  "lifecycle.feature",
);

// Options for a `cucumberRun` call. One object keeps `undefined` out of
// positional command args (Vitest's RPC drops a middle `undefined`).
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

// One channel + run promise per browser session.
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
// Support is built once for the whole project: step definitions register as
// Node proxies that dispatch their bodies to the browser. Per-session rebuilds
// are impossible (ESM evaluates a module once) so a promise is cached to
// prevent concurrent sessions from racing the initial build.
let sharedSupport: Promise<SharedSupport> | undefined;
const getOrCreateChannel = (sessionId: string): BrowserChannel => {
  let channel = channels.get(sessionId);
  if (!channel) {
    channel = new BrowserChannel();
    channels.set(sessionId, channel);
  }
  return channel;
};

export const createCucumberCommands = (config: Partial<IConfiguration>) => {
    // Fetch the browser registry, build the run config, then load native support
    // (registering a Node proxy per browser-defined step/hook/param-type).
    const buildSharedSupport = async (): Promise<SharedSupport> => {
    const testStepErrors = new Map<string, SerializedError>();
    // Ask the browser for the full registry in one round-trip.
    const { steps, hooks, testRunHooks, parameterTypes, defaultTimeout } =
      await dispatchGetRegistry();

    // Run config is resolved once: dry-run and real run share the pinned seed.
    const { runConfiguration } = await resolveRunConfiguration({
      config,
      loadSupportPath,
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

  const ensureSupport = (): Promise<SharedSupport> =>
    (sharedSupport ??= buildSharedSupport());

  // Single driver for every run a session makes (dry-run, real run, AfterAll).
  // Always finishes the channel so the browser pull loop terminates.
  const run = async (
    channel: BrowserChannel,
    options: RunOptions,
    projectName?: string,
  ): Promise<{
    featureName: string;
    results: ResultItem[];
  }> => {
    try {
      const { id, dispatchTestCaseFinished, withHook, runtime, testLocations } =
        options;

      const cached = await ensureSupport();

      // Collect envelopes for `--publish` on real runs; no-op when publishing is off.
      const publish = !runtime?.dryRun && isPublishEnabled();

      const { featureName, results, envelopes, startedAt } = await runCucumber({
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
        publish,
        onTestCaseFinished: dispatchTestCaseFinished
          ? (result) => {
              void channel.dispatch("testCaseFinished", result);
            }
          : undefined,
      });

      await writeEnvelopes({ envelopes, startedAt, projectName });

      return { featureName, results: [...results.values()] };
    } finally {
      channel.finish();
    }
  };

  // Kicks off a run immediately so the browser pull loop isn't starved.
  const cucumberRun: BrowserCommand<[RunOptions], void> = (ctx, options) => {
    const channel = getOrCreateChannel(ctx.sessionId);

    // `ctx.project?.name` matches the globalSetup teardown's project name.
    // Optional-chained for the in-Node bridge harness (ctx has no project).
    runs.set(
      ctx.sessionId,
      runWithChannel(channel, () => run(channel, options, ctx.project?.name)),
    );
  };

  const cucumberNextTask: BrowserCommand<[], ChannelTask | null> = (ctx) =>
    getOrCreateChannel(ctx.sessionId).next();

  const cucumberReportTask: BrowserCommand<
    [{ taskId: string; result?: unknown; err?: SerializedError }],
    void
  > = (ctx, outcome) => {
    getOrCreateChannel(ctx.sessionId).report(
      outcome.taskId,
      outcome.result,
      outcome.err,
    );
  };

  // Node-only facts the page can't compute: runtime version and lifecycle path.
  const cucumberMetadata: BrowserCommand<
    [],
    { version: string; lifecycleFeaturePath: string }
  > = () => ({ version: cucumberVersion, lifecycleFeaturePath });

  // Awaits the in-flight run, surfaces results, then cleans up the session.
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
