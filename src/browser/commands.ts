import { version as cucumberVersion } from "@cucumber/cucumber";
import type {
  IConfiguration,
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadSupport } from "@cucumber/cucumber/api";
import type { ResolveFnOutput } from "node:module";
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
const loadSupportUrl = pathToFileURL(loadSupportPath).toString();

// Appends ?p=uuid to every loadSupport import so each browser project gets
// a fresh module evaluation and an independent step/hook library.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    const uniquify = (r: ResolveFnOutput) =>
      r.url.split("?")[0] === loadSupportUrl
        ? { ...r, url: `${loadSupportUrl}?p=${crypto.randomUUID()}` }
        : r;
    return uniquify(result);
  },
});

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
  testLocations?: number[];
  provided?: Pick<
    Partial<IConfiguration>,
    "name" | "dryRun" | "retry" | "worldParameters"
  >;
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
};
const getOrCreateChannel = (sessionId: string): BrowserChannel => {
  let channel = channels.get(sessionId);
  if (!channel) {
    channel = new BrowserChannel();
    channels.set(sessionId, channel);
  }
  return channel;
};

// Serializes concurrent buildSharedSupport calls across projects so that
// globalRef.support and supportCodeLibraryBuilder (both global singletons) are
// never accessed by two projects at the same time.
const buildQueue = (() => {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    add<T>(fn: () => Promise<T>): Promise<T> {
      const p = chain.then(fn);
      chain = p.catch(() => {});
      return p;
    },
  };
})();

export const createCucumberCommands = (config: Partial<IConfiguration>) => {
  // Per-project cache: the ESM resolve hook gives each call a unique URL so
  // loadSupport.ts re-evaluates per project, building an independent library.
  let sharedSupport: Promise<SharedSupport> | undefined;
  // Fetch the browser registry, build the run config, then load native support
  // (registering a Node proxy per browser-defined step/hook/param-type).
  const buildSharedSupport = async (): Promise<SharedSupport> => {
    // Independent work: run in parallel before entering the critical section.
    const [registry, { runConfiguration }] = await Promise.all([
      dispatchGetRegistry(),
      resolveRunConfiguration({ config, loadSupportPath }),
    ]);

    // Critical section: globalRef.support write + loadSupport (builder singleton).
    return buildQueue.add(async () => {
      globalRef.__vitest_cucumber_browser__ ??= {};
      globalRef.__vitest_cucumber_browser__.support = {
        ...registry,
      };
      const support = await loadSupport(runConfiguration).finally(() => {
        delete globalRef.__vitest_cucumber_browser__?.support;
      });
      return { runConfiguration, support };
    });
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
      const {
        id,
        dispatchTestCaseFinished,
        withHook,
        testLocations,
        provided,
      } = options;

      const cached = await ensureSupport();

      // Collect envelopes for `--publish` on real runs; no-op when publishing is off.
      const publish = !provided?.dryRun && isPublishEnabled();

      const { featureName, results, envelopes, startedAt } = await runCucumber({
        id,
        runConfiguration: prepareRunConfiguration({
          id,
          runConfiguration: cached.runConfiguration,
          support: cached.support,
          withHook,
          provided,
          testLocations,
        }),
        testStepErrors: channel.testStepErrors,
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
