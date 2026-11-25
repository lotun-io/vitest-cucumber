import { beforeAll, expect, test } from "vitest";
import { defaultRunOptions } from "../../../utils/runOptions.ts";
import { gherkinOf } from "../../__tests__/gherkinOf.ts";
import { createRuntimeEnvironment } from "../../browser/runtimeEnvironment.ts";
import { Given } from "../../cucumber/recorders.ts";
import { createPlatform } from "../createPlatform.ts";

const uri = "features/retries.feature";

const { document, pickles } = gherkinOf(
  `Feature: Retries
  Scenario: Failing
    Given a step that fails

  Scenario: Flaky
    Given a step that fails once

  Scenario: Undefined
    Given a step nobody defined

  Scenario: Passing
    Given a step
`,
  uri,
);

/** How many times each step's code ran. */
const ran = { failing: 0, flaky: 0, passing: 0 };

/** A platform on a host of its own: one worker, no Vitest, a run's failures as they are. */
const platform = createPlatform({
  worker: () => ({ workerId: "1", totalWorkers: 1, projectName: "" }),
  env: {},
  importSupport: (importSupport) => importSupport(),
  locate: (stacks) => Promise.resolve(stacks.map(() => undefined)),
  environment: () => ({
    ...createRuntimeEnvironment(),
    defaultTimeouts: { test: -1, hook: -1 },
  }),
  colors: () => false,
  throwable: (failures) => failures.map(({ value }) => value),
});

/** Runs Vitest's `attempt` of the scenario named `name` (`more`: whether its `retry` allows another). */
const attemptOf = (name: string, attempt: number, more: boolean) => {
  const pickle = pickles.find((each) => each.name === name);
  if (!pickle) {
    throw new Error(`no scenario ${name}`);
  }
  return platform.scenario({
    uri,
    name,
    document,
    pickle,
    attempt: { attempt, moreAttemptsRemaining: more },
  });
};

beforeAll(async () => {
  platform.use({ cwd: "/p", options: defaultRunOptions }, async () => {
    Given("a step that fails", () => {
      ran.failing += 1;
      throw new Error("always");
    });
    Given("a step that fails once", () => {
      ran.flaky += 1;
      if (ran.flaky === 1) {
        throw new Error("the first time");
      }
    });
    Given("a step", () => {
      ran.passing += 1;
    });
  });
  await platform.load();
});

test("a scenario cucumber retries (failed, with attempts left): Vitest's next attempt runs it again", async () => {
  const first = await attemptOf("Flaky", 0, true);
  expect(first.error?.value).toEqual([new Error("the first time")]);
  expect(await attemptOf("Flaky", 1, false)).toEqual({ annotations: [] });
  expect(ran.flaky).toBe(2);
});

test("a scenario cucumber doesn't retry (no attempts left for it): Vitest's next attempt gets its last error again, nothing run", async () => {
  const before = ran.failing;
  const first = await attemptOf("Failing", 0, false);
  expect(first.error?.value).toEqual([new Error("always")]);
  const second = await attemptOf("Failing", 1, false);
  // The same error, with no attachments of its own (the test keeps the first attempt's).
  expect(second).toEqual({ annotations: [], error: first.error });
  expect(second.error).toBe(first.error);
  expect(ran.failing).toBe(before + 1);
});

test("an undefined step is never cucumber's to retry, whatever attempts Vitest has left: its summary's error again", async () => {
  const first = await attemptOf("Undefined", 0, true);
  expect(first.error).toBeDefined();
  const second = await attemptOf("Undefined", 1, false);
  expect(second.error).toBe(first.error);
});

test("an attempt after another scenario's run, and a first attempt, always run: the last error kept is one scenario's own", async () => {
  const before = ran.failing;
  await attemptOf("Failing", 0, false);
  // Another scenario failed in between: the last attempt kept is its own, not this one's.
  const between = await attemptOf("Undefined", 0, false);
  const later = await attemptOf("Failing", 1, false);
  expect(later.error).not.toBe(between.error);
  expect(later.error?.value).toEqual([new Error("always")]);
  // A first attempt (a repeat's): run, whatever the last one was.
  await attemptOf("Failing", 0, false);
  expect(ran.failing).toBe(before + 3);
});
