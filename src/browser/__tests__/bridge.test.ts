/**
 * In-Node integration harness for the browser-mode bridge.
 *
 * The browser bridge is provider-agnostic (Vitest commands only) and the
 * `cucumberShim` is pure ESM, so the ENTIRE browser→node path can be driven in
 * Node: this test plays the role of the page (the pull loop + the shim) and
 * calls the real Node-side commands. One run exercises `commands.ts`,
 * `channel.ts`, `taskBridge.ts` and `browser/loadSupport.ts` together with the
 * real `@cucumber/cucumber` runtime — the code that runs for real in the browser
 * e2e but which the Node v8 coverage provider can't instrument there.
 *
 * It mirrors `browser/runner.ts`'s `runFeatureFile` (dry-run plan → real run →
 * AfterAll teardown), minus the Vitest test registration.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { globalRef } from "../../utils/globals.ts";
import type { ResultItem } from "../../utils/runCucumber.ts";
import type { SerializedError } from "../../utils/serializeError.ts";
import { serializeError } from "../../utils/serializeError.ts";
import type { ChannelTask } from "../channel.ts";
import { createCucumberCommands } from "../commands.ts";
import type { BrowserAttachment, BrowserBridge } from "../cucumberShim.ts";
import {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeAll,
  BeforeStep,
  context,
  defineParameterType,
  Given,
  setWorldConstructor,
  Then,
  World,
} from "../cucumberShim.ts";

const harnessFeature = path.join(
  import.meta.dirname,
  "features",
  "harness.feature",
);
const lifecycleFeature = path.join(
  import.meta.dirname,
  "..",
  "..",
  "features",
  "lifecycle.feature",
);

const cmds = createCucumberCommands({ worldParameters: { greeting: "hello" } });
type Ctx = Parameters<typeof cmds.cucumberNextTask>[0];
// The commands only read `ctx.sessionId`; a minimal stub stands in for the real
// Vitest BrowserCommandContext the provider would supply.
const ctx = { sessionId: "harness" } as unknown as Ctx;

const bridge = (): BrowserBridge => {
  const installed = globalRef.__vitest_cucumber_browser__?.bridge;
  if (!installed) {
    throw new Error("cucumberShim did not install the browser bridge");
  }
  return installed as BrowserBridge;
};

// ---- the "page" side: registered support + captured side effects ----

class HarnessWorld extends World {
  value = 0;
}
setWorldConstructor(HarnessWorld);

const flags = {
  beforeAll: false,
  afterAll: false,
  before: false,
  after: false,
  beforeStep: 0,
  afterStep: 0,
  contextGreeting: undefined as unknown,
};
let capturedRows: string[][] | undefined;

BeforeAll(function beforeAll() {
  flags.beforeAll = true;
  flags.contextGreeting = (
    context as { parameters?: { greeting?: string } }
  ).parameters?.greeting;
});
AfterAll(function afterAll() {
  flags.afterAll = true;
});
Before(function before() {
  flags.before = true;
});
After(function after() {
  flags.after = true;
});
BeforeStep(function beforeStep() {
  flags.beforeStep += 1;
});
AfterStep(function afterStep() {
  flags.afterStep += 1;
});

Given("a value of {int}", function aValue(this: unknown, n: unknown) {
  (this as HarnessWorld).value = n as number;
});
Then("the value should be {int}", function theValue(this: unknown, n: unknown) {
  expect((this as HarnessWorld).value).toBe(n as number);
});
Then("an attachment is recorded", function anAttachment(this: unknown) {
  (this as HarnessWorld).attach("hi", "text/plain");
});
Then("the following rows:", function theRows(this: unknown, table: unknown) {
  capturedRows = (table as { raw(): string[][] }).raw();
});
defineParameterType({
  name: "num",
  regexp: /\d+/,
  transformer: (value: string) => Number(value),
});
Then(
  "the doubled {num} is {int}",
  function theDoubled(this: unknown, n: unknown, expected: unknown) {
    expect((n as number) * 2).toBe(expected as number);
  },
);

// Option-variant registrations: these drive loadSupport's registration branches
// (hook tag-string vs options-object, step/BeforeAll/AfterAll WITH options, a
// RegExp matcher, and an array-regexp parameter type). Most are covered just by
// being registered; the callback step is exercised by a scenario below.
Before("@tagged", function taggedBefore() {
  return undefined;
});
After({ tags: "@tagged" }, function taggedAfter() {
  return undefined;
});
BeforeStep("@tagged", function taggedBeforeStep() {
  return undefined;
});
AfterStep({ tags: "@tagged" }, function taggedAfterStep() {
  return undefined;
});
BeforeAll({ timeout: 5000 }, function optBeforeAll() {
  return undefined;
});
AfterAll({ timeout: 5000 }, function optAfterAll() {
  return undefined;
});
Given("a step with options", { timeout: 5000 }, function optStep() {
  return undefined;
});
Given(/^a regexp step$/, function regexpStep() {
  return undefined;
});
defineParameterType({
  name: "arr",
  regexp: [/foo/, /bar/],
  transformer: (value: string) => value,
});
Given("a callback step", function callbackStep(this: unknown, cb: unknown) {
  (cb as () => void)();
});

// ---- the "page" side: the pull loop (mirrors browser/runner.ts) ----

type Outcome = {
  value?: unknown;
  err?: SerializedError;
  attachments?: BrowserAttachment[];
  hookResult?: unknown;
  hookError?: SerializedError;
};

const runTask = async (task: ChannelTask): Promise<Outcome> => {
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
          arg: Parameters<BrowserBridge["runHook"]>[2];
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

const pump = async (
  onTestCaseFinished?: (finished: ResultItem) => void,
): Promise<void> => {
  // Every value that crosses the Vitest command RPC is structured-cloned by
  // Vitest; the real browser therefore always works on COPIES. The in-process
  // channel here would otherwise share references, so we clone at the boundary
  // to faithfully reproduce the wire (e.g. a hook's `arg.result` must be a copy
  // of Cucumber's own step result, not the same object it re-reads its duration
  // from).
  const cross = <T>(value: T): T => structuredClone(value);

  for (
    let pulled = await cmds.cucumberNextTask(ctx);
    pulled;
    pulled = await cmds.cucumberNextTask(ctx)
  ) {
    const task = cross(pulled);
    if (task.kind === "testCaseFinished") {
      onTestCaseFinished?.(task.payload as ResultItem);
      await cmds.cucumberReportTask(ctx, task.id, {});
      continue;
    }
    // Fire-and-forget (mirrors browser/runner.ts): Cucumber dispatches serially,
    // so the next `cucumberNextTask` parks on an empty queue and the loop stays
    // effectively serial, but a body that awaits another dispatch (e.g. a
    // parameter-type transform resolved mid-step) won't block the loop.
    const current = task;
    void (async () => {
      const outcome = await runTask(current);
      for (const attachment of outcome.attachments ?? []) {
        await cmds.cucumberAttach(ctx, cross(attachment));
      }
      const result =
        current.kind === "hook"
          ? {
              value: outcome.value,
              hookResult: outcome.hookResult,
              hookError: outcome.hookError,
            }
          : outcome.value;
      await cmds.cucumberReportTask(
        ctx,
        current.id,
        cross({
          result,
          err: outcome.err,
        }),
      );
    })().catch(() => undefined);
  }
};

describe("browser bridge (driven in Node)", () => {
  it("runs the plan, the real run and the AfterAll teardown end-to-end", async () => {
    // DRY-RUN PLAN: builds the shared support (dispatching the registry getters)
    // and returns the scenario tree without executing any body.
    cmds.cucumberRun(ctx, {
      id: harnessFeature,
      dispatchTestCaseFinished: false,
      withHook: "none",
      runtime: { dryRun: true },
    });
    await pump();
    const plan = await cmds.cucumberEnd(ctx);
    expect(plan.featureName).toBe("Bridge harness");
    expect(plan.results).toHaveLength(3);
    // No body ran during the plan.
    expect(flags.before).toBe(false);
    expect(flags.beforeAll).toBe(false);

    // REAL RUN: BeforeAll + step/hook bodies execute via the pull loop, each
    // scenario streams back as it finishes.
    cmds.cucumberRun(ctx, {
      id: harnessFeature,
      dispatchTestCaseFinished: true,
      withHook: "before",
    });
    const streamed: ResultItem[] = [];
    await pump((finished) => streamed.push(finished));
    const real = await cmds.cucumberEnd(ctx);

    expect(streamed).toHaveLength(3);
    expect(real.results.map((r) => r.status)).toEqual([
      "PASSED",
      "PASSED",
      "PASSED",
    ]);

    // The bridged bodies really ran in the "page".
    expect(flags.beforeAll).toBe(true);
    expect(flags.contextGreeting).toBe("hello");
    expect(flags.before).toBe(true);
    expect(flags.after).toBe(true);
    expect(flags.beforeStep).toBeGreaterThan(0);
    expect(flags.afterStep).toBeGreaterThan(0);
    expect(capturedRows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);

    // AFTERALL TEARDOWN: the browser drives this by passing the lifecycle
    // feature with `withHook: "after"`.
    cmds.cucumberRun(ctx, {
      id: lifecycleFeature,
      dispatchTestCaseFinished: false,
      withHook: "after",
    });
    await pump();
    await cmds.cucumberEnd(ctx);
    expect(flags.afterAll).toBe(true);
  });

  it("cucumberEnd throws when no run is in flight for the session", async () => {
    await expect(cmds.cucumberEnd(ctx)).rejects.toThrow(
      "cucumberEnd called with no in-flight run",
    );
  });
});
