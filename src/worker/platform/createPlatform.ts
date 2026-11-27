// The `Platform`, the same on every host (`../../types/platform.ts`'s `Host`: node mode's worker,
// browser mode's page, Storybook's story tests and its preview), on the plugin's runtime
// (`../runner/`). A feature module (or a stories file's) only says what support code to load as it's
// imported (`Platform["use"]`), so collecting test files (`vitest list`) runs none of it. The
// worker's or page's first file loads it as it runs (`Platform["load"]`, the worker fixture: Vitest
// gives every run new workers and pages, so one lives within one run), the host's pieces in order:
// it reads its worker's run, sets cucumber's worker variables (`./workerEnvironment.ts`), imports the
// support code, which records its calls (`../cucumber/registry.ts`), closes the registry (a later
// call fails), locates each call, then builds the support code (`../runner/supportCode.ts`), its
// ids the run's (`../runner/supportIds.ts`), and the runner, with the run's options and the host's
// environment. Every message is the run's, as cucumber's: each batch main gets is a run's own
// messages (its query's), as they are. Each run's outcome is what its test shows (`ScenarioOutcome`,
// `HookOutcome`): a scenario's attachments, its skip (`./scenario/skipped.ts`), or its error
// (`./errors/testErrors.ts`), with cucumber's summary for undefined, pending or ambiguous steps
// (`./summary/`). Page-safe.
import type { AssembledTestCase } from "@cucumber/core";
import { type Envelope, IdGenerator } from "@cucumber/messages";
import type { ImportSupport } from "../../types/feature.ts";
import type {
  HookOutcome,
  Host,
  LoadRun,
  Platform,
  Run,
  RunWorker,
  ScenarioOutcome,
  ScenarioRun,
  ScenarioToRun,
} from "../../types/platform.ts";
import type { SupportCall } from "../../types/supportCode.ts";
import { pluginError } from "../../utils/errors.ts";
import { registry } from "../cucumber/registry.ts";
import { createRunner } from "../runner/runner.ts";
import { buildSupportCode } from "../runner/supportCode.ts";
import { supportIds } from "../runner/supportIds.ts";
import { errorsOf, summaryFailureOf } from "./errors/testErrors.ts";
import { annotationsOf } from "./scenario/annotations.ts";
import { skipOf } from "./scenario/skipped.ts";
import { summaryOf } from "./summary/summary.ts";
import { workerEnvironment } from "./workerEnvironment.ts";
import { workerLabel } from "./workerLabel.ts";

/** The platform on `host`. */
export const createPlatform = (host: Host): Platform => {
  /** The command that takes the run's messages: none unless the run's stream has a subscriber. */
  const { messages } = host;

  /**
   * Sends a batch of the run's messages to main (`support`: the support code's), when the run's
   * stream has a subscriber.
   */
  const send = async (envelopes: readonly Envelope[], support = false) => {
    await messages?.("messages", {
      batch: { support, envelopes },
    });
  };

  /** A BeforeAll or AfterAll run's outcome, its messages sent first. */
  const hooksRun = async (run: Run, what: string): Promise<HookOutcome> => {
    await send(run.query.envelopes());
    return run.success
      ? { passed: true }
      : { passed: false, error: host.throwable(errorsOf(run, what), what) };
  };

  /** The runner of `worker` for `run`, on support code built from `calls`, its messages sent. */
  const build = async (
    calls: readonly SupportCall[],
    run: LoadRun,
    { workerId, projectName }: RunWorker,
  ) => {
    const environment = host.environment();
    // The support code's ids: the same in every worker with the same support code.
    const support = buildSupportCode(calls, {
      newId: supportIds(calls),
      wrapper: registry.wrapper,
      expressionOf: environment.expressionOf,
    });
    await send(support.query.envelopes(), true);
    return createRunner({
      support,
      newId: IdGenerator.uuid(),
      options: run.options,
      // The messages' worker id: its project named (`CUCUMBER_WORKER_ID` the number alone).
      workerId: workerLabel(workerId, projectName),
      environment,
    });
  };

  /** Loads the support code: its worker's run's support code and runner, built from its calls. */
  const start = async (run: LoadRun, importSupport: ImportSupport) => {
    const worker = host.worker();
    // Cucumber's worker variables, before the support code loads.
    Object.assign(host.env, workerEnvironment(worker));
    // A support file that throws as it's imported: the plugin's error, the original its cause
    // (Vitest prints it, its frames at the support file's line; Storybook's error screen shows
    // only a message and a stack, the browser's console the whole error).
    await host.importSupport(() =>
      importSupport().catch((error: unknown) => {
        throw pluginError("the support code failed to load", {
          cause: error,
          quiet: true,
        });
      }),
    );
    registry.loaded = true;
    const locations = await host.locate(
      registry.calls.map(({ stack }) => stack),
      run.cwd,
    );
    const calls = registry.calls.map(({ method, args, stack }, index) => ({
      method,
      args,
      location: locations[index],
      ...(stack !== undefined && { stack }),
    }));
    return { run, runner: await build(calls, run, worker) };
  };

  /** Runs an attempt of `scenario` (a retry's, its previous attempt's `testCase`): its outcome. */
  const runScenario = async (
    { uri, name, document, pickle, attempt }: ScenarioToRun,
    testCase: AssembledTestCase | undefined,
  ): Promise<{ outcome: ScenarioOutcome; run: ScenarioRun }> => {
    const {
      runner: scenarioRunner,
      run: { cwd, options },
    } = await loadedRun();
    const run = await scenarioRunner.scenario(document, pickle, {
      ...attempt,
      ...(testCase && { testCase }),
    });
    await send(run.query.envelopes());
    const annotations = annotationsOf(run.query);
    if (run.success) {
      const skipped = skipOf(run.query);
      return {
        outcome: { annotations, ...(skipped && { skipped }) },
        run,
      };
    }
    const file = `${cwd}/${uri}`;
    /**
     * The failed run's errors. With an undefined, pending or ambiguous step (not in a dry run,
     * which never fails), cucumber's summary too; if building it fails, the plugin's own error
     * says so.
     */
    const failures = () => {
      if (options.dryRun || !run.query.firstUnexplained()) {
        return errorsOf(run, name, { file, summary: undefined });
      }
      let summary: string | undefined;
      try {
        summary = summaryOf({ query: run.query, colors: host.colors() });
      } catch (error) {
        return summaryFailureOf(run, file, error);
      }
      return errorsOf(run, name, { file, summary });
    };
    return {
      outcome: {
        annotations,
        error: { value: host.throwable(failures(), name) },
      },
      run,
    };
  };

  /**
   * The last attempt run (the worker runs one scenario at a time): Vitest's next attempt of its
   * scenario runs its test case again if cucumber retries it, else gets its error again.
   */
  let last:
    | {
        pickleId: string;
        willBeRetried: boolean;
        testCase: AssembledTestCase;
        error?: ScenarioOutcome["error"];
      }
    | undefined;

  /** The support code to load (`use`'s first). */
  let toLoad: { run: LoadRun; importSupport: ImportSupport } | undefined;
  /** The support code loaded: the run's support code and runner. */
  let loaded: ReturnType<typeof start> | undefined;
  /** The error of a worker that has no support code (no feature module gave it any). */
  const noSupportCode = () =>
    pluginError("the worker has no support code", { internal: true });
  /** The worker's support code loaded: its run, its runner (`load`'s). */
  const loadedRun = async () => {
    if (!loaded) {
      throw noSupportCode();
    }
    return loaded;
  };

  return {
    use: (run, importSupport) => {
      toLoad ??= { run, importSupport };
    },
    load: async () => {
      loaded ??= toLoad
        ? start(toLoad.run, toLoad.importSupport)
        : Promise.reject(noSupportCode());
      await loaded;
    },
    beforeAll: async () => {
      const { runner } = await loadedRun();
      return hooksRun(await runner.beforeAll(), "BeforeAll");
    },
    afterAll: async () => {
      if (!loaded) {
        throw noSupportCode();
      }
      // Support code that failed to load has no AfterAll hooks to run: no outcome (its error is
      // the feature files', their `beforeAll`'s, once).
      const run = await loaded.catch(() => undefined);
      if (!run) {
        return undefined;
      }
      return hooksRun(await run.runner.afterAll(), "AfterAll");
    },
    scenario: async (scenario): Promise<ScenarioOutcome> => {
      const { pickle, attempt } = scenario;
      const previous =
        attempt && attempt.attempt > 0 && last?.pickleId === pickle.id
          ? last
          : undefined;
      // A later attempt of a scenario cucumber doesn't retry: its last attempt's error again,
      // nothing run (its attachments already the test's: Vitest keeps a test's annotations across
      // its attempts).
      if (previous && !previous.willBeRetried && previous.error) {
        return { annotations: [], error: previous.error };
      }
      const { outcome, run } = await runScenario(
        scenario,
        previous?.willBeRetried ? previous.testCase : undefined,
      );
      last = {
        pickleId: pickle.id,
        willBeRetried: run.willBeRetried,
        testCase: run.testCase,
        ...(outcome.error && { error: outcome.error }),
      };
      return outcome;
    },
  };
};
