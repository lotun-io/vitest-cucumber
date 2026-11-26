// The run's Cucumber Messages, as the plugin's stream has them: collected by the harness
// (`../support/messages.ts`), one combined stream per Vitest run (each run's from its `meta` to its
// `testRunFinished`).
import type { DataTable } from "@cucumber/cucumber";
import { Given, Then } from "@cucumber/cucumber";
import type { Envelope } from "@cucumber/messages";
import { expect } from "vitest";
import type { E2EWorld } from "../support/world.ts";

/** Each run's stream, in order: a run's messages from its `meta` on. */
const runs = (world: E2EWorld) => {
  const streams: Envelope[][] = [];
  for (const envelope of world.messages ?? []) {
    if (envelope.meta) {
      streams.push([]);
    }
    streams.at(-1)?.push(envelope);
  }
  return streams;
};

/** The last run's stream. */
const lastRun = (world: E2EWorld) => {
  const stream = runs(world).at(-1);
  if (!stream) {
    throw new Error("No stream: no message collected");
  }
  return stream;
};

/** A stream's test cases, test case attempts and pickles, by id (the scenarios' names). */
const scenarioNames = (stream: readonly Envelope[]) => {
  const pickles = new Map(
    stream.flatMap(({ pickle }) => (pickle ? [[pickle.id, pickle.name]] : [])),
  );
  const testCases = new Map(
    stream.flatMap(({ testCase }) =>
      testCase ? [[testCase.id, pickles.get(testCase.pickleId) ?? ""]] : [],
    ),
  );
  const started = new Map(
    stream.flatMap(({ testCaseStarted }) =>
      testCaseStarted
        ? [
            [
              testCaseStarted.id,
              testCases.get(testCaseStarted.testCaseId) ?? "",
            ],
          ]
        : [],
    ),
  );
  return { testCases, started };
};

/** Rows as compared in any order. */
const sorted = (rows: object[]) =>
  rows.map((row) => JSON.stringify(row)).sort();

/** A worker id's number (`1 [project]` → 1). */
const workerNumber = (workerId: string | undefined) =>
  Number.parseInt(workerId ?? "", 10);

/** Checks `stream` is one cucumber run: its `meta` first, its end last, one start, its id everywhere. */
const expectOneRun = (stream: readonly Envelope[]) => {
  expect(Object.keys(stream[0] ?? {})).toEqual(["meta"]);
  expect(Object.keys(stream.at(-1) ?? {})).toEqual(["testRunFinished"]);
  const started = stream.flatMap(({ testRunStarted }) =>
    testRunStarted ? [testRunStarted.id] : [],
  );
  expect(started).toHaveLength(1);
  for (const envelope of stream) {
    const message = Object.values(envelope)[0] as {
      testRunStartedId?: string;
    };
    if (message.testRunStartedId !== undefined) {
      expect(message.testRunStartedId).toBe(started[0]);
    }
  }
};

// The harness collects the runs' messages from now on (`../support/messages.ts`).
Given("the run's messages are collected", (world: E2EWorld) => {
  world.messages = [];
});

// The run's one stream (every project's in it): a cucumber run, its test cases' scenarios (in any
// order) and, with a `WORKER` column, the worker each ran on (its project named, an unnamed one's
// alone).
Then(
  "the run's stream has the test cases:",
  (world: E2EWorld, table: DataTable) => {
    expect(runs(world)).toHaveLength(1);
    const stream = lastRun(world);
    expectOneRun(stream);
    const { testCases } = scenarioNames(stream);
    const workers = new Map(
      stream.flatMap(({ testCaseStarted }) =>
        testCaseStarted
          ? [[testCaseStarted.testCaseId, testCaseStarted.workerId ?? ""]]
          : [],
      ),
    );
    const expected = table.hashes();
    const rows = [...testCases].map(([id, name]) => ({
      SCENARIO: name,
      ...("WORKER" in (expected[0] ?? {}) && { WORKER: workers.get(id) }),
    }));
    expect(sorted(rows)).toEqual(sorted(expected));
  },
);

// Every feature file once, whatever projects or plugins ran it: each test case's pickle sent.
Then(
  "each feature file is in the stream once, its pickles every test case's",
  (world: E2EWorld) => {
    const stream = lastRun(world);
    const uris = stream.flatMap(({ source }) => (source ? [source.uri] : []));
    expect(uris.length).toBeGreaterThan(0);
    expect(new Set(uris).size).toBe(uris.length);
    const pickles = new Set(
      stream.flatMap(({ pickle }) => (pickle ? [pickle.id] : [])),
    );
    const testCases = stream.flatMap(({ testCase }) =>
      testCase ? [testCase.pickleId] : [],
    );
    expect(testCases.length).toBeGreaterThan(1);
    for (const id of testCases) {
      expect(pickles.has(id), id).toBe(true);
    }
  },
);

// The text of a scenario's failed step (or hook): as Vitest prints its error.
Then(
  "in the stream, the scenario {string} fails with:",
  (world: E2EWorld, scenario: string, text: string) => {
    const stream = lastRun(world);
    const { started } = scenarioNames(stream);
    const messages = stream.flatMap(({ testStepFinished }) =>
      testStepFinished?.testStepResult.status === "FAILED" &&
      started.get(testStepFinished.testCaseStartedId) === scenario
        ? [testStepFinished.testStepResult.message ?? ""]
        : [],
    );
    expect(messages.join("\n")).toContain(text);
  },
);

// Each attempt of a scenario, in order: its number, whether it's retried.
Then(
  "in the stream, the attempts are:",
  (world: E2EWorld, table: DataTable) => {
    const stream = lastRun(world);
    const { started } = scenarioNames(stream);
    const finished = new Map(
      stream.flatMap(({ testCaseFinished }) =>
        testCaseFinished
          ? [
              [
                testCaseFinished.testCaseStartedId,
                testCaseFinished.willBeRetried,
              ],
            ]
          : [],
      ),
    );
    const attempts = stream.flatMap(({ testCaseStarted }) =>
      testCaseStarted
        ? [
            {
              SCENARIO: started.get(testCaseStarted.id) ?? "",
              ATTEMPT: String(testCaseStarted.attempt),
              RETRIED: String(finished.get(testCaseStarted.id)),
            },
          ]
        : [],
    );
    expect(attempts).toEqual(table.hashes());
  },
);

/** The BeforeAll and AfterAll runs of `stream`, in order: each hook's type and status. */
const hookRunsOf = (stream: readonly Envelope[]) => {
  const types = new Map(
    stream.flatMap(({ hook }) => (hook ? [[hook.id, hook.type]] : [])),
  );
  const hookOf = new Map(
    stream.flatMap(({ testRunHookStarted }) =>
      testRunHookStarted
        ? [[testRunHookStarted.id, testRunHookStarted.hookId]]
        : [],
    ),
  );
  return stream.flatMap(({ testRunHookFinished }) =>
    testRunHookFinished
      ? [
          {
            HOOK:
              types.get(
                hookOf.get(testRunHookFinished.testRunHookStartedId) ?? "",
              ) ?? "",
            STATUS: testRunHookFinished.result.status,
          },
        ]
      : [],
  );
};

// The BeforeAll and AfterAll runs, in order: each hook's type and its result's status.
Then(
  "in the stream, the run's hooks are:",
  (world: E2EWorld, table: DataTable) => {
    expect(hookRunsOf(lastRun(world))).toEqual(table.hashes());
  },
);

// The same, in any order: several workers' runs, each sent as it ran.
Then(
  "in the stream, the run's hooks are, in any order:",
  (world: E2EWorld, table: DataTable) => {
    expect(sorted(hookRunsOf(lastRun(world)))).toEqual(sorted(table.hashes()));
  },
);

// The run's `success` (`testRunFinished`): cucumber's, and Vitest's.
Then(
  /^in the stream, the run (succeeds|fails)$/,
  (world: E2EWorld, outcome: string) => {
    const finished = lastRun(world).at(-1)?.testRunFinished;
    expect(finished?.success).toBe(outcome === "succeeds");
  },
);

/** In a run's stream: the worker id of each BeforeAll run, and of each test case. */
const workerIdsOf = (stream: readonly Envelope[]) => {
  const beforeAllHooks = new Set(
    stream.flatMap(({ hook }) =>
      hook?.type === "BEFORE_TEST_RUN" ? [hook.id] : [],
    ),
  );
  return {
    beforeAll: stream.flatMap(({ testRunHookStarted }) =>
      testRunHookStarted && beforeAllHooks.has(testRunHookStarted.hookId)
        ? [testRunHookStarted.workerId ?? ""]
        : [],
    ),
    testCases: stream.flatMap(({ testCaseStarted }) =>
      testCaseStarted ? [testCaseStarted.workerId ?? ""] : [],
    ),
  };
};

// Each BeforeAll's worker id its slot (Vitest's pool id), 1 to `max`; each test case on a worker
// whose BeforeAll ran in the run.
Then(
  "in the stream, every BeforeAll's worker id is 1 to {int}",
  (world: E2EWorld, max: number) => {
    const { beforeAll, testCases } = workerIdsOf(lastRun(world));
    expect(beforeAll.length).toBeGreaterThan(0);
    for (const id of beforeAll) {
      expect(workerNumber(id)).toBeGreaterThanOrEqual(1);
      expect(workerNumber(id)).toBeLessThanOrEqual(max);
    }
    for (const id of testCases) {
      expect(beforeAll).toContain(id);
    }
  },
);

// How many workers or pages ran BeforeAll (`isolate: true`: one per feature file).
Then(
  /^in the stream, BeforeAll runs (at most )?(\d+) times?$/,
  (world: E2EWorld, atMost: string | undefined, count: string) => {
    const ran = workerIdsOf(lastRun(world)).beforeAll.length;
    if (atMost) {
      expect(ran).toBeGreaterThan(0);
      expect(ran).toBeLessThanOrEqual(Number(count));
    } else {
      expect(ran).toBe(Number(count));
    }
  },
);

// The run's `success` is Vitest's verdict, as its exit code says (Vitest's own reporter's PASS or
// FAIL: a failed test module, an unhandled error): a Vitest that decides runs otherwise fails this.
Then("the stream's success is Vitest's", (world: E2EWorld) => {
  const finished = lastRun(world).at(-1)?.testRunFinished;
  expect(finished?.success, world.lastRun.output).toBe(
    world.lastRun.exitCode === 0,
  );
});
