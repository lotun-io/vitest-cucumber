import { HookType } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import { createQuery } from "../query.ts";

/** A run's query: a test case of `testSteps`, and a hook of each type in `hooks`, by id. */
const runOf = (
  testSteps: { id: string; hookId?: string; pickleStepId?: string }[],
  hooks: Record<string, HookType | undefined> = {},
) =>
  createQuery([
    ...Object.entries(hooks).map(([id, type]) => ({
      hook: {
        id,
        ...(type && { type }),
        sourceReference: { uri: "features/hooks.ts", location: { line: 1 } },
      },
    })),
    {
      testCase: {
        id: "case",
        pickleId: "pickle",
        testRunStartedId: "run",
        testSteps: testSteps.map((step) => ({ ...step })),
      },
    },
  ]);

describe("Query.testStepOf: a hook's text", () => {
  test("by the hook's type: an After hook in a scenario without steps is an After hook", () => {
    const query = runOf(
      [
        { id: "s1", hookId: "before" },
        { id: "s2", hookId: "after" },
      ],
      { before: HookType.BEFORE_TEST_CASE, after: HookType.AFTER_TEST_CASE },
    );
    expect(query.testStepOf("s1")).toEqual({ text: "Before hook failed" });
    expect(query.testStepOf("s2")).toEqual({ text: "After hook failed" });
  });

  test("a hook without a type (older messages): by its place, around the first step", () => {
    const query = runOf(
      [
        { id: "s1", hookId: "a" },
        { id: "s2", pickleStepId: "step" },
        { id: "s3", hookId: "b" },
      ],
      { a: undefined, b: undefined },
    );
    expect(query.testStepOf("s1")).toEqual({ text: "Before hook failed" });
    expect(query.testStepOf("s3")).toEqual({ text: "After hook failed" });
  });
});

describe("a run's query on the support query (the support code's messages, read once)", () => {
  const sourceReference = { uri: "features/steps.ts", location: { line: 1 } };
  const support = createQuery([
    {
      stepDefinition: {
        id: "def",
        pattern: { source: "a step", type: "CUCUMBER_EXPRESSION" as never },
        sourceReference,
      },
    },
    { hook: { id: "hook", type: HookType.AFTER_TEST_CASE, sourceReference } },
    {
      parameterType: {
        id: "type",
        name: "color",
        regularExpressions: ["red"],
        preferForRegularExpressionMatch: false,
        useForSnippets: true,
      },
    },
  ]);

  test("its definitions, hooks and parameter types are the support query's, not its messages", () => {
    const run = createQuery([], { support });
    expect(run.stepDefinition("def")?.id).toBe("def");
    expect(run.hook("hook")?.type).toBe(HookType.AFTER_TEST_CASE);
    expect(run.parameterTypes().map(({ name }) => name)).toEqual(["color"]);
    expect(run.envelopes()).toEqual([]);
  });

  test("what the run reads stays the run's: the support query is never written", () => {
    const run = createQuery([], { support });
    run.update({
      testCase: {
        id: "case",
        pickleId: "pickle",
        testRunStartedId: "run",
        testSteps: [{ id: "s", hookId: "hook" }],
      },
    });
    expect(run.testStepOf("s")).toEqual({ text: "After hook failed" });
    expect(run.envelopes()).toHaveLength(1);
    expect(support.envelopes()).toHaveLength(3);
    expect(support.testStep("s")).toBeUndefined();
  });
});

test("its context is read for its lookups, never its messages (a scenario's pickle, a retry's test case)", () => {
  const testCase = {
    id: "case",
    pickleId: "pickle",
    testRunStartedId: "run",
    testSteps: [{ id: "s", pickleStepId: "ps" }],
  };
  const run = createQuery([], {
    context: [
      {
        pickle: {
          id: "pickle",
          uri: "features/a.feature",
          name: "a",
          language: "en",
          astNodeIds: [],
          tags: [],
          steps: [{ id: "ps", text: "a step", astNodeIds: [] }],
        },
      },
      { testCase },
    ],
  });
  run.update({
    testStepFinished: {
      testCaseStartedId: "started",
      testStepId: "s",
      testStepResult: {
        status: "UNDEFINED" as never,
        duration: { seconds: 0, nanos: 0 },
      },
      timestamp: { seconds: 0, nanos: 0 },
    },
  });
  expect(run.pickleStepOf("s")?.text).toBe("a step");
  expect(run.undefinedStepTexts()).toEqual(["a step"]);
  expect(run.envelopes().map((envelope) => Object.keys(envelope)[0])).toEqual([
    "testStepFinished",
  ]);
});
