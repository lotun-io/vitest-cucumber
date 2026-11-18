import type { Envelope } from "@cucumber/messages";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { TestModule, TestProject, TestSpecification } from "vitest/node";
import type { MessageBatch } from "../../../types/messages.ts";
import { slash } from "../../../utils/slash.ts";
import { createTestRuns, type ProjectSource } from "../testRuns.ts";

/** What the test runs provide a project as a run starts (the rest of its provided values kept). */
interface Provided {
  projectName: string;
  sendMessages?: boolean;
}

/** The values each project was given, in order. */
const provides = new WeakMap<TestProject, Provided[]>();

/** A project named `name` (a browser's: `browser`), its provided values kept. */
const projectOf = (name: string, browser?: string): TestProject => {
  let context = { vitestCucumber: { projectName: name } as Provided };
  const project = {
    name,
    config: {
      browser: browser ? { enabled: true, name: browser } : { enabled: false },
    },
    vite: { config: { plugins: [] } },
    getProvidedContext: () => context,
    provide: (_key: string, value: Provided) => {
      context = { vitestCucumber: value };
      provides.get(project as unknown as TestProject)?.push(value);
    },
  } as unknown as TestProject;
  provides.set(project, []);
  return project;
};

/** The values `project` was last given. */
const lastProvided = (project: TestProject) => provides.get(project)?.at(-1);

const node = projectOf("in-node");
const page = projectOf("in-browser (chromium)", "chromium");

/** A feature file of the fixtures (an empty one: its source only). */
// A path as Vitest gives a module id (`/`, also on Windows, where a URL's `pathname` is `/C:/…`).
const file = slash(
  fileURLToPath(new URL("fixtures/a.feature", import.meta.url)),
);
const plainFile = file.replace(/a\.feature$/, "plain.test.ts");

/**
 * A plugin, as the test runs know it: its run-start part recorded in `calls`, each feature file of
 * its test files planned without Gherkin (its source only).
 */
const sourceOf = (calls: string[] = []): ProjectSource => ({
  runStart: async (specifications) => {
    calls.push("runStart");
    return specifications.flatMap(({ moduleId }) =>
      moduleId.endsWith(".feature")
        ? [
            {
              feature: moduleId,
              uri: moduleId.replace(/^.*\//, ""),
              plan: { error: new Error("not planned") },
              content: "",
            },
          ]
        : [],
    );
  },
});

/** `project` running `moduleId` (the fixtures' feature file). */
const specificationOf = (project: TestProject, moduleId = file) =>
  ({ project, moduleId }) as unknown as TestSpecification;

/** A test module as it ended: whether it passed. */
const moduleOf = (ok = true) => ({ ok: () => ok }) as unknown as TestModule;

const kinds = (envelopes: readonly Envelope[]) =>
  envelopes.map((envelope) => Object.keys(envelope)[0]);

/**
 * Test runs of the node and page projects (`watch`: in watch mode), with a subscriber: its runs,
 * started and ended through its reporter.
 */
const subscribed = ({ watch = false } = {}) => {
  const testRuns = createTestRuns({ watch });
  const messages: Envelope[] = [];
  const unsubscribe = testRuns.subscribe((envelope) => messages.push(envelope));
  testRuns.register(node, sourceOf());
  testRuns.register(page, sourceOf());
  /** Starts a run of `specifications`. */
  const start = async (specifications: TestSpecification[] = []) => {
    await testRuns.reporter.onTestRunStart?.(specifications);
  };
  const end = async (
    testModules: TestModule[] = [],
    unhandledErrors: unknown[] = [],
  ) => {
    await testRuns.reporter.onTestRunEnd?.(
      testModules,
      unhandledErrors as never,
      "passed",
    );
  };
  const success = () => messages.at(-1)?.testRunFinished?.success;
  /** A support batch. */
  const support = (envelopes: Envelope[]): MessageBatch => ({
    support: true,
    envelopes,
  });
  return { testRuns, messages, unsubscribe, start, end, success, support };
};

const definition = (id: string) =>
  ({ stepDefinition: { id } }) as unknown as Envelope;

describe("Vitest's runs", () => {
  test("a run's start: whether to send its messages in every project's provided values (the others kept); each plugin's part once (whatever its projects)", async () => {
    const testRuns = createTestRuns({ watch: false });
    const calls: string[] = [];
    const source = sourceOf(calls);
    const first = projectOf("first");
    const second = projectOf("second", "chromium");
    testRuns.register(first, source);
    testRuns.register(second, source);
    await testRuns.reporter.onTestRunStart?.([]);
    expect(lastProvided(first)).toEqual({
      projectName: "first",
      sendMessages: false,
    });
    expect(lastProvided(second)).toEqual({
      projectName: "second",
      sendMessages: false,
    });
    expect(calls).toEqual(["runStart"]);
    // A subscriber: the next run's messages sent.
    testRuns.subscribe(() => undefined);
    await testRuns.reporter.onTestRunStart?.([]);
    expect(lastProvided(first)?.sendMessages).toBe(true);
    expect(lastProvided(second)?.sendMessages).toBe(true);
  });
});

describe("a run's combined stream", () => {
  test("its opening with its first batch (`meta`, each feature file once), the batches, its end: every project's", async () => {
    const { testRuns, messages, start, end, support } = subscribed();
    // Both projects run the same feature file.
    await start([specificationOf(node), specificationOf(page)]);
    expect(messages).toEqual([]);
    testRuns.receive(support([definition("a")]));
    testRuns.receive(support([definition("a")]));
    await end([moduleOf(), moduleOf()]);
    expect(kinds(messages)).toEqual([
      "meta",
      "source",
      "stepDefinition",
      "testRunStarted",
      "testRunFinished",
    ]);
    // Once it ended, its batches dropped.
    testRuns.receive(support([definition("c")]));
    expect(messages).toHaveLength(5);
  });

  test("a run without batches (e.g. no feature file): its whole stream still", async () => {
    const { messages, start, end, success } = subscribed();
    await start([specificationOf(node, plainFile)]);
    await end([moduleOf()]);
    expect(kinds(messages)).toEqual([
      "meta",
      "testRunStarted",
      "testRunFinished",
    ]);
    expect(success()).toBe(true);
  });

  test("each run its own stream, its messages' run id none", async () => {
    const { testRuns, messages, start, end, support } = subscribed();
    await start();
    await end();
    await start();
    testRuns.receive(support([definition("a")]));
    await end();
    expect(kinds(messages)).toEqual([
      "meta",
      "testRunStarted",
      "testRunFinished",
      "meta",
      "stepDefinition",
      "testRunStarted",
      "testRunFinished",
    ]);
    expect(messages[1]?.testRunStarted?.id).toBe("");
    expect(messages.at(-1)?.testRunFinished?.testRunStartedId).toBe("");
  });

  test("in watch mode: no stream, the workers and pages told not to send their messages", async () => {
    const { testRuns, messages, start, end, support } = subscribed({
      watch: true,
    });
    await start([specificationOf(node)]);
    expect(lastProvided(node)?.sendMessages).toBe(false);
    testRuns.receive(support([definition("a")]));
    await end([moduleOf()]);
    expect(messages).toEqual([]);
  });

  test("unsubscribed: no stream from the next run on", async () => {
    const { messages, unsubscribe, start, end } = subscribed();
    unsubscribe();
    await start();
    await end();
    expect(lastProvided(node)?.sendMessages).toBe(false);
    expect(messages).toEqual([]);
  });
});

describe("a run's success: Vitest's verdict of the run", () => {
  const ended = async (
    testModules: TestModule[],
    unhandledErrors: unknown[] = [],
  ) => {
    const { start, end, success } = subscribed();
    await start();
    await end(testModules, unhandledErrors);
    return success();
  };

  test("every test module passed, no unhandled error: it passed", async () => {
    expect(await ended([moduleOf(), moduleOf()])).toBe(true);
  });

  test("a test module failed (any test file's): it failed", async () => {
    expect(await ended([moduleOf(), moduleOf(false)])).toBe(false);
  });

  test("an unhandled error (a hook's, the worker's cleanup's, anyone's): it failed", async () => {
    expect(await ended([moduleOf()], [new Error("late")])).toBe(false);
  });
});
