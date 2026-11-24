import type { Envelope, TestStepResultStatus } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import type { Run } from "../../../../types/platform.ts";
import { withFailures } from "../../../runner/failures.ts";
import { createQuery } from "../../../runner/query.ts";
import { errorsOf } from "../testErrors.ts";

const timestamp = { seconds: 0, nanos: 0 };

/** A run's `testRunFinished`, its crash's real error on it if given. */
const testRunFinished = (...crashes: unknown[]): Envelope => ({
  testRunFinished: withFailures({ success: false, timestamp }, crashes),
});

/** A test run hook's failed result (`id` its start's), its real errors on it. */
const failedHook = (id: string, ...failures: unknown[]): Envelope => ({
  testRunHookFinished: {
    testRunHookStartedId: id,
    result: withFailures(
      { status: "FAILED" as TestStepResultStatus, duration: timestamp },
      failures,
    ),
    timestamp,
  },
});

const runOf = (envelopes: Envelope[]) =>
  ({ success: false, query: createQuery(envelopes) }) satisfies Run;

/** The failures' values. */
const valuesOf = (run: Run, what: string) =>
  errorsOf(run, what).map(({ value }) => value);

describe("errorsOf", () => {
  test("the run's crash, its real error", () => {
    const crash = new TypeError("teardown failed");
    expect(errorsOf(runOf([testRunFinished(crash)]), "BeforeAll")).toEqual([
      { value: crash },
    ]);
  });

  test("the run's crash after its results' errors, each the original", () => {
    const hookError = new Error("hook failed");
    const crash = new Error("teardown failed");
    const values = valuesOf(
      runOf([failedHook("hook", hookError), testRunFinished(crash)]),
      "AfterAll",
    );
    expect(values).toHaveLength(2);
    expect(values[0]).toBe(hookError);
    expect(values[1]).toBe(crash);
  });

  test("an AggregateError as it is (its host decides how it's sent)", () => {
    const aggregate = new AggregateError([new Error("first")], "both");
    expect(
      valuesOf(runOf([failedHook("hook", aggregate)]), "BeforeAll"),
    ).toEqual([aggregate]);
    expect(
      valuesOf(runOf([failedHook("hook", aggregate)]), "BeforeAll")[0],
    ).toBe(aggregate);
  });

  test("a failed run without any error: the plugin's bug", () => {
    expect(() => errorsOf(runOf([testRunFinished()]), "BeforeAll")).toThrow(
      "[@lotun/vitest-cucumber] a failed BeforeAll without its errors (a bug in @lotun/vitest-cucumber, please report it",
    );
  });

  test("a failed result without its real error, the plugin's bug", () => {
    expect(() => errorsOf(runOf([failedHook("hook")]), "BeforeAll")).toThrow(
      "[@lotun/vitest-cucumber] a failed result without its error (a bug in @lotun/vitest-cucumber",
    );
  });

  test("a thrown value that isn't an error, the cause of the run's", () => {
    for (const value of ["Not an Error", null, undefined, { code: "E" }]) {
      const [error] = valuesOf(
        runOf([failedHook("hook", value)]),
        "BeforeAll",
      ) as Error[];
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe("BeforeAll failed");
      expect(error?.cause).toBe(value);
    }
  });

  test("an error, or an object with a string stack, as it is", () => {
    const error = new Error("an error");
    const copy = { name: "Error", message: "a copy", stack: "Error: a copy" };
    for (const value of [error, copy]) {
      expect(valuesOf(runOf([failedHook("hook", value)]), "BeforeAll")[0]).toBe(
        value,
      );
    }
  });
});
