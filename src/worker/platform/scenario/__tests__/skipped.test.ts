import type { Envelope, TestStepResultStatus } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import type { Query } from "../../../../types/query.ts";
import { createQuery } from "../../../runner/query.ts";
import { skipOf } from "../skipped.ts";

const timestamp = { seconds: 0, nanos: 0 };

/**
 * A scenario's run: one test step per status, each a pickle step `step <n>` written `When step <n>`
 * in its feature file, or (`hook`) a Before hook.
 */
const runOf = (...statuses: (string | ["hook", string])[]): Query => {
  const steps = statuses.map((each, index) => ({
    id: String(index),
    hook: Array.isArray(each),
    status: Array.isArray(each) ? each[1] : each,
  }));
  return createQuery([
    {
      gherkinDocument: {
        comments: [],
        feature: {
          location: { line: 1 },
          tags: [],
          language: "en",
          keyword: "Feature",
          name: "A",
          description: "",
          children: [
            {
              scenario: {
                id: "scenario",
                location: { line: 2 },
                tags: [],
                keyword: "Scenario",
                name: "a",
                description: "",
                examples: [],
                steps: steps.map(({ id }) => ({
                  id: `ast-${id}`,
                  location: { line: 3 },
                  keyword: "When ",
                  text: `step ${id}`,
                })),
              },
            },
          ],
        },
      },
    },
    {
      pickle: {
        id: "pickle",
        uri: "features/a.feature",
        name: "a",
        language: "en",
        astNodeIds: [],
        tags: [],
        steps: steps.map(({ id }) => ({
          id: `pickle-step-${id}`,
          text: `step ${id}`,
          astNodeIds: [`ast-${id}`],
        })),
      },
    },
    {
      testCase: {
        id: "test-case",
        pickleId: "pickle",
        testSteps: steps.map(({ id, hook }) =>
          hook
            ? { id, hookId: "hook" }
            : {
                id,
                pickleStepId: `pickle-step-${id}`,
                stepDefinitionIds: [],
                stepMatchArgumentsLists: [],
              },
        ),
      },
    },
    ...steps.map(({ id, status }): Envelope => ({
      testStepFinished: {
        testCaseStartedId: "started",
        testStepId: id,
        testStepResult: {
          status: status as TestStepResultStatus,
          duration: timestamp,
        },
        timestamp,
      },
    })),
  ]);
};

describe("skipOf (a successful run's skip)", () => {
  test("every result skipped: skipped, no note", () => {
    expect(skipOf(runOf("SKIPPED", "SKIPPED"))).toEqual({});
  });

  test("a skip among passing steps and hooks, as cucumber's status: skipped", () => {
    // A step that skips after one that passed, the After hooks still run.
    expect(skipOf(runOf("PASSED", "SKIPPED", "PASSED"))).toEqual({});
    // Only an After hook skips.
    expect(skipOf(runOf("PASSED", "PASSED", "SKIPPED"))).toEqual({});
  });

  test("pending (`strict: false`), undefined or ambiguous (a dry run): skipped, the first such step its note, as the summary names it", () => {
    expect(skipOf(runOf("PASSED", "PENDING", "SKIPPED"))).toEqual({
      note: "Pending step: When step 1",
    });
    expect(skipOf(runOf("SKIPPED", "UNDEFINED", "UNDEFINED"))).toEqual({
      note: "Undefined step: When step 1",
    });
    expect(skipOf(runOf("AMBIGUOUS", "SKIPPED"))).toEqual({
      note: "Ambiguous step: When step 0",
    });
  });

  test("a hook's note names the hook", () => {
    expect(skipOf(runOf(["hook", "PENDING"], "SKIPPED"))).toEqual({
      note: "Pending step: Before hook",
    });
  });

  test("passed: every result passed, a failed result an After hook rewrote, or no result at all", () => {
    expect(skipOf(runOf("PASSED", "PASSED"))).toBeUndefined();
    expect(skipOf(runOf("FAILED", "PASSED"))).toBeUndefined();
    expect(skipOf(createQuery())).toBeUndefined();
  });
});
