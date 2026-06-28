import {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeAll,
  BeforeStep,
  context,
  ITestCaseHookParameter,
  Status,
} from "@cucumber/cucumber";

import { expect } from "vitest";
import type { TestWorld } from "./world.ts";

// Lifecycle counters (BeforeAll/AfterAll have no World) — a step asserts
// BeforeAll runs once per feature, not once per scenario.
export const lifecycle = { beforeAll: 0, afterAll: 0 };

// `context` (run scope) carries the worldParameters and is only usable inside
// BeforeAll/AfterAll; assert it resolves (throws → surfaces as a hook error).
const expectContextGreeting = (): void => {
  expect(
    (context as { parameters?: { greeting?: string } }).parameters?.greeting,
  ).toBe("hello");
};

// Self-checking hooks for the error/outcome fixtures. Registered FIRST so they
// run LAST (After hooks are LIFO) — i.e. after a failing `@failAfter` hook too.
// Each asserts the scenario's final outcome and, when it matches, rewrites the
// result to PASSED so the self-checking scenario reports green.
const assertScenario = (ctx: ITestCaseHookParameter, fn: () => void) => {
  try {
    fn();
    if (ctx.result) {
      ctx.result.status = Status.PASSED;
      delete ctx.result.message;
      delete ctx.result.exception;
    }
    ctx.error = undefined;
  } catch (err) {
    const e = err as Error;
    ctx.error = e;
    if (ctx.result) {
      ctx.result.status = Status.FAILED;
      ctx.result.message = e.message;
    }
  }
};

// @failMessage(failed_intentionally) → scenario FAILED, message contains "failed intentionally"
After((ctx) => {
  const tag = ctx.pickle.tags.find((t) => t.name.startsWith("@failMessage"));
  if (!tag) {
    return;
  }
  const message = tag.name
    .match(/^@failMessage\((.*)\)$/)
    ?.at(1)
    ?.replaceAll("_", " ");
  assertScenario(ctx, () => {
    expect(ctx.result?.status).toBe(Status.FAILED);
    expect(message).toBeTruthy();
    expect(ctx.result?.message).toContain(message);
  });
});

// @expectStatus(UNDEFINED) → scenario status === UNDEFINED
After((ctx) => {
  const tag = ctx.pickle.tags.find((t) => t.name.startsWith("@expectStatus"));
  if (!tag) {
    return;
  }
  const status = tag.name.match(/^@expectStatus\((.*)\)$/)?.at(1);
  assertScenario(ctx, () => {
    expect(status).toBeTruthy();
    expect(ctx.result?.status).toBe(status);
  });
});

// @expectDiff → the captured error carries a Vitest diff (showDiff/expected/actual)
After((ctx) => {
  const tag = ctx.pickle.tags.find((t) => t.name.startsWith("@expectDiff"));
  if (!tag) {
    return;
  }
  assertScenario(ctx, () => {
    expect(ctx.result?.status).toBe(Status.FAILED);
    expect(ctx.error?.showDiff).toBe(true);
    expect(ctx.error?.expected).toBeDefined();
    expect(ctx.error?.actual).toBeDefined();
  });
});

// @afterRewrites → rewrite a deliberately failed scenario to PASSED. Proves a
// scenario-level After's in-place result mutation takes effect (in browser mode
// this exercises the hook-parameter round-trip back to Node).
After(
  { tags: "@afterRewrites" },
  function rewrite(ctx: ITestCaseHookParameter) {
    if (ctx.result) {
      ctx.result.status = Status.PASSED;
      delete ctx.result.message;
      delete ctx.result.exception;
    }
    ctx.error = undefined;
  },
);

// Lifecycle counting (proves Before/BeforeStep/AfterStep and the hook parameter
// are bridged in browser mode; harmless no-ops for the other scenarios).
Before(function countHook(this: TestWorld) {
  this.hookCount += 1;
});

Before(function captureName(
  this: TestWorld,
  { pickle }: ITestCaseHookParameter,
) {
  this.scenarioName = pickle.name;
});

BeforeStep(function countBeforeStep(this: TestWorld) {
  this.beforeStepCount += 1;
});

AfterStep(function countAfterStep(this: TestWorld) {
  this.afterStepCount += 1;
});

Before({ tags: "@skip" }, function before() {
  return "skipped";
});

Before({ tags: "@failBefore" }, function failBefore() {
  throw new Error("Before failed intentionally");
});

// Tag EXPRESSION (not a single tag): runs only when a scenario carries both tags.
Before({ tags: "@tagOne and @tagTwo" }, function taggedBoth(this: TestWorld) {
  this.tagExpr = true;
});

After({ tags: "@failAfter" }, function failAfter() {
  throw new Error("After failed intentionally");
});

BeforeAll(function beforeAll() {
  expectContextGreeting();
  lifecycle.beforeAll += 1;
});

AfterAll(function afterAll() {
  expectContextGreeting();
  lifecycle.afterAll += 1;
});
