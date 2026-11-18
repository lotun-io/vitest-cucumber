import {
  AstBuilder,
  compile,
  GherkinClassicTokenMatcher,
  Parser,
} from "@cucumber/gherkin";
import { IdGenerator, type Pickle } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import type { FeatureGherkin, RunOptions } from "../../../types/feature.ts";
import type { Query } from "../../../types/query.ts";
import type { Code, SupportCall } from "../../../types/supportCode.ts";
import { createRuntimeEnvironment } from "../../browser/runtimeEnvironment.ts";
import { world as currentWorld } from "../../cucumber/page.ts";
import { failuresOf } from "../failures.ts";
import { createRunner } from "../runner.ts";
import { buildSupportCode } from "../supportCode.ts";

/** A page's runtime environment, with cucumber's default timeouts (a host adds its own). */
const pageEnvironment = () => ({
  ...createRuntimeEnvironment(),
  defaultTimeouts: { test: 5000, hook: 5000 },
});

const uri = "features/a.feature";

const gherkinOf = (source: string): FeatureGherkin => {
  const newId = IdGenerator.incrementing();
  const document = {
    ...new Parser(
      new AstBuilder(newId),
      new GherkinClassicTokenMatcher(),
    ).parse(source),
    uri,
  };
  return { document, pickles: [...compile(document, uri, newId)] };
};

const at = { uri: "features/steps.ts", line: 1, column: 1 };
const call = (method: string, ...args: unknown[]): SupportCall => ({
  method,
  args,
  location: at,
});

const runnerOf = (
  calls: SupportCall[],
  options: RunOptions = {},
  wrapper?: (code: Code, o: unknown) => Code,
  environment = pageEnvironment(),
) => {
  const newId = IdGenerator.incrementing();
  return createRunner({
    workerId: "1",
    support: buildSupportCode(calls, { newId, wrapper }),
    newId,
    options,
    environment,
  });
};

/**
 * A scenario run's step results, as `<text>: <status>` (hooks as `hook`): its own messages' (its
 * pickle's step texts its query's, from its context).
 */
const statusesOf = (query: Query) =>
  query
    .envelopes()
    .flatMap(({ testStepFinished }) =>
      testStepFinished
        ? [
            `${query.pickleStepOf(testStepFinished.testStepId)?.text ?? "hook"}: ${testStepFinished.testStepResult.status}`,
          ]
        : [],
    );

/** The arguments of a runner's `scenario` for `feature`'s pickle `index`. */
const scenario = (feature: FeatureGherkin, index = 0) =>
  [feature.document, feature.pickles[index] as Pickle] as const;

describe("a scenario", () => {
  const feature = gherkinOf(`Feature: A
  Scenario: one
    Given a step
    When it fails
    Then a later step
`);

  test("its messages in cucumber's order; after a failure, steps skipped, After hooks still run", async () => {
    const order: string[] = [];
    const failure = new Error("it failed");
    const runner = runnerOf([
      call("Before", () => void order.push("Before")),
      call(
        "After",
        function (
          this: unknown,
          { result, error }: { result?: { status: string }; error?: unknown },
        ) {
          order.push(
            `After ${String(result?.status)} ${error === failure ? "error" : "no error"}`,
          );
        },
      ),
      call("Given", "a step", () => void order.push("step")),
      call("When", "it fails", () => {
        throw failure;
      }),
      call("Then", "a later step", () => void order.push("never")),
    ]);
    const run = await runner.scenario(...scenario(feature));
    // As cucumber's: an After hook's `error` is the last step's, here a skipped one's (none).
    expect(order).toEqual(["Before", "step", "After FAILED no error"]);
    expect(statusesOf(run.query)).toEqual([
      "hook: PASSED",
      "a step: PASSED",
      "it fails: FAILED",
      "a later step: SKIPPED",
      "hook: PASSED",
    ]);
    const kinds = run.query
      .envelopes()
      .map((envelope) => Object.keys(envelope)[0])
      .filter((kind) => /^test(Case|Step)(Started|Finished)$/.test(kind ?? ""));
    expect(kinds).toEqual([
      "testCaseStarted",
      ...Array.from({ length: 5 }, () => [
        "testStepStarted",
        "testStepFinished",
      ]).flat(),
      "testCaseFinished",
    ]);
    expect(run.success).toBe(false);
    const failed = run.query
      .results()
      .find(({ result }) => result.status === "FAILED");
    expect(failuresOf(failed?.result)).toEqual([failure]);
    expect(failed?.result.exception).toMatchObject({
      type: "Error",
      message: "it failed",
    });
  });

  test("a thrown value that isn't an error: the step fails with its text (cucumber's `util.format`), the value its failure", async () => {
    const noPrototype = Object.assign(Object.create(null) as object, {
      code: 1,
    });
    const runner = runnerOf([
      call("Given", "a step", () => undefined),
      call("When", "it fails", () => {
        throw noPrototype;
      }),
      call("Then", "a later step", () => undefined),
    ]);
    const run = await runner.scenario(...scenario(feature));
    expect(statusesOf(run.query)).toEqual([
      "a step: PASSED",
      "it fails: FAILED",
      "a later step: SKIPPED",
    ]);
    const failed = run.query
      .results()
      .find(({ result }) => result.status === "FAILED");
    expect(failed?.result.message).toBe("Error: { code: 1 }");
    expect(failuresOf(failed?.result)).toEqual([noPrototype]);
  });

  test("an After hook that changes the result changes the scenario's (cucumber's object)", async () => {
    const runner = runnerOf([
      call("After", ({ result }: { result: { status: string } }) => {
        result.status = "PASSED";
      }),
      call("Given", "a step", () => undefined),
      call("When", "it fails", () => {
        throw new Error("no");
      }),
      call("Then", "a later step", () => undefined),
    ]);
    expect((await runner.scenario(...scenario(feature))).success).toBe(true);
  });
});

test("undefined, ambiguous and pending steps; `strict: false` passes a pending one", async () => {
  const feature = gherkinOf(`Feature: A
  Scenario: undefined
    Given nobody defined this
  Scenario: ambiguous
    Given twice
  Scenario: pending
    Given later
`);
  const calls = [
    call("Given", "twice", () => undefined),
    call("Given", /^twi/, () => undefined),
    call("Given", "later", () => "pending"),
  ];
  const runner = runnerOf(calls);
  const undefinedRun = await runner.scenario(...scenario(feature, 0));
  expect(statusesOf(undefinedRun.query)).toEqual([
    "nobody defined this: UNDEFINED",
  ]);
  expect(undefinedRun.success).toBe(false);
  expect(
    statusesOf((await runner.scenario(...scenario(feature, 1))).query),
  ).toEqual(["twice: AMBIGUOUS"]);
  expect((await runner.scenario(...scenario(feature, 2))).success).toBe(false);
  expect(
    (await runnerOf(calls, { strict: false }).scenario(...scenario(feature, 2)))
      .success,
  ).toBe(true);
});

test("a dry run: hooks and defined steps skipped, undefined ones still undefined, never failing", async () => {
  const feature = gherkinOf(`Feature: A
  Scenario: one
    Given a step
    Then nobody defined this
`);
  const runner = runnerOf(
    [call("Before", () => undefined), call("Given", "a step", () => undefined)],
    { dryRun: true },
  );
  const run = await runner.scenario(...scenario(feature));
  expect(statusesOf(run.query)).toEqual([
    "hook: SKIPPED",
    "a step: SKIPPED",
    "nobody defined this: UNDEFINED",
  ]);
  expect(run.success).toBe(true);
});

test("arguments: parameter types (their transformer's `this` the World), a data table, a doc string", async () => {
  const feature = gherkinOf(`Feature: A
  Scenario: one
    Given a red ball and:
      | a | b |
      | 1 | 2 |
    Then the text:
      """
      hello
      """
`);
  const seen: unknown[] = [];
  class TestWorld {
    readonly prefix = "#";
  }
  const runner = runnerOf([
    call("setWorldConstructor", TestWorld),
    call("defineParameterType", {
      name: "color",
      regexp: /red|blue/,
      transformer(this: TestWorld, value: string) {
        return `${this.prefix}${value}`;
      },
    }),
    call(
      "Given",
      "a {color} ball and:",
      (color: string, table: { hashes(): unknown }) =>
        void seen.push(color, table.hashes()),
    ),
    call("Then", "the text:", function (this: unknown, text: string) {
      seen.push(
        text,
        this instanceof TestWorld,
        currentWorld === undefined ? "no world" : "world",
      );
    }),
  ]);
  expect((await runner.scenario(...scenario(feature))).success).toBe(true);
  expect(seen).toEqual(["#red", [{ a: "1", b: "2" }], "hello", true, "world"]);
});

test("the World's attach/log/link: attachments of the running step", async () => {
  const feature = gherkinOf(`Feature: A
  Scenario: one
    Given it attaches
`);
  const runner = runnerOf([
    call(
      "Given",
      "it attaches",
      function (this: {
        log(text: string): void;
        attach(data: string, type: string): void;
      }) {
        this.log("hello");
        this.attach("e30=", "base64:application/json");
      },
    ),
  ]);
  const run = await runner.scenario(...scenario(feature));
  const [log, json] = run.query.attachments();
  const testStepId = run.query.results()[0]?.testStepId;
  expect(log).toMatchObject({
    body: "hello",
    mediaType: "text/x.cucumber.log+plain",
    testStepId,
  });
  expect(json).toMatchObject({
    body: "e30=",
    contentEncoding: "BASE64",
    mediaType: "application/json",
  });
});

describe("user code", () => {
  const feature = gherkinOf(`Feature: A
  Scenario: one
    Given a step
`);
  const resultOf = async (calls: SupportCall[]) =>
    (await runnerOf(calls).scenario(...scenario(feature))).query.results()[0]
      ?.result;

  test("a callback, its error; both a callback and a promise: cucumber's error", async () => {
    expect(
      (
        await resultOf([
          call(
            "Given",
            "a step",
            (done: (error?: unknown) => void) => void setTimeout(done, 1),
          ),
        ])
      )?.status,
    ).toBe("PASSED");
    expect(
      (
        await resultOf([
          call(
            "Given",
            "a step",
            (done: (error?: unknown) => void) =>
              void done(new Error("callback error")),
          ),
        ])
      )?.message,
    ).toContain("callback error");
    expect(
      (
        await resultOf([
          call("Given", "a step", async (done: () => void) => void done),
        ])
      )?.message,
    ).toContain(
      "function uses multiple asynchronous interfaces: callback and promise",
    );
  });

  test("the platform's default timeout (Vitest's), unless a definition has its own", async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 50));
    const fast = {
      ...createRuntimeEnvironment(),
      defaultTimeouts: { test: 5, hook: 5 },
    };
    const resultWith = async (calls: SupportCall[]) =>
      (
        await runnerOf(calls, {}, undefined, fast).scenario(
          ...scenario(feature),
        )
      ).query.results()[0]?.result;
    expect(
      (await resultWith([call("Given", "a step", slow)]))?.message,
    ).toContain(
      "function timed out, ensure the promise resolves within 5 milliseconds",
    );
    expect(
      (await resultWith([call("Given", "a step", { timeout: 1000 }, slow)]))
        ?.status,
    ).toBe("PASSED");
  });

  test("its own timeout, and cucumber's wrong arity error", async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      (await resultOf([call("Given", "a step", { timeout: 5 }, slow)]))
        ?.message,
    ).toContain(
      "function timed out, ensure the promise resolves within 5 milliseconds",
    );
    expect(
      (
        await resultOf([
          call("Given", "a step", (a: unknown, b: unknown) => void [a, b]),
        ])
      )?.message,
    ).toBe(
      "Error: function has 2 arguments, should have 0 (if synchronous or returning a promise) or 1 (if accepting a callback)",
    );
  });
});

test("step hooks: BeforeStep by tags; a failing one skips the step; AfterStep in reverse", async () => {
  const feature = gherkinOf(`Feature: A
  @tagged
  Scenario: one
    Given a step
`);
  const order: string[] = [];
  const runner = runnerOf([
    call("BeforeStep", { tags: "@other" }, () => void order.push("never")),
    call("BeforeStep", "@tagged", () => void order.push("BeforeStep")),
    call("AfterStep", () => void order.push("AfterStep 1")),
    call("AfterStep", () => void order.push("AfterStep 2")),
    call("Given", "a step", () => void order.push("step")),
  ]);
  await runner.scenario(...scenario(feature));
  expect(order).toEqual(["BeforeStep", "step", "AfterStep 2", "AfterStep 1"]);

  const failing = runnerOf([
    call("BeforeStep", () => {
      throw new Error("no");
    }),
    call("Given", "a step", () => void order.push("not run")),
  ]);
  const run = await failing.scenario(...scenario(feature));
  expect(statusesOf(run.query)).toEqual(["a step: FAILED"]);
  expect(order).not.toContain("not run");
});

test("BeforeAll and AfterAll: the world parameters as `this.parameters`, AfterAll in reverse, a failure kept", async () => {
  const order: unknown[] = [];
  const failure = new Error("AfterAll failed");
  const runner = runnerOf(
    [
      call("BeforeAll", function (this: { parameters: unknown }) {
        order.push(this.parameters);
      }),
      call("AfterAll", () => {
        order.push("AfterAll 1");
        throw failure;
      }),
      call("AfterAll", () => void order.push("AfterAll 2")),
    ],
    { worldParameters: { url: "x" } },
  );
  expect((await runner.beforeAll()).success).toBe(true);
  const afterAll = await runner.afterAll();
  expect(order).toEqual([{ url: "x" }, "AfterAll 2", "AfterAll 1"]);
  expect(afterAll.success).toBe(false);
  expect(
    afterAll.query.results().map(({ result }) => failuresOf(result)),
  ).toEqual([[], [failure]]);
});

test("the platform's `around`: each step as the feature reads it, and BeforeAll, with its failure", async () => {
  const feature = gherkinOf(`Feature: A
  Scenario: one
    Given a step
    When a failing step
`);
  const failure = new Error("Step failed");
  const seen: { label: string; failure?: unknown }[] = [];
  const newId = IdGenerator.incrementing();
  const runner = createRunner({
    workerId: "1",
    support: buildSupportCode(
      [
        call("Before", () => undefined),
        call("BeforeAll", () => undefined),
        call("Given", "a step", () => undefined),
        call("When", "a failing step", () => {
          throw failure;
        }),
      ],
      { newId },
    ),
    newId,
    options: {},
    environment: {
      ...pageEnvironment(),
      around: async (label, run) => {
        const outcome = await run();
        seen.push({ label, failure: outcome.failure?.value });
        return outcome;
      },
    },
  });
  await runner.beforeAll();
  await runner.scenario(...scenario(feature));
  // A case hook (Before) isn't a step of its own.
  expect(seen).toEqual([
    { label: "BeforeAll", failure: undefined },
    { label: "Given a step", failure: undefined },
    { label: "When a failing step", failure },
  ]);
});
