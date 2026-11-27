import type {
  Envelope,
  TestStepResultStatus,
  UndefinedParameterType,
} from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import { createQuery } from "../../../runner/query.ts";
import { usedMissingTypes } from "../missingParameterTypes.ts";

const timestamp = { seconds: 0, nanos: 0 };

/** A scenario's run with one step per text, each with its status (`UNDEFINED` by default). */
const runOf = (steps: (string | [string, string])[]): Envelope[] => {
  const each = steps.map((step, index) => {
    const [text, status] =
      typeof step === "string" ? [step, "UNDEFINED"] : step;
    return { text, status, id: String(index) };
  });
  return [
    {
      pickle: {
        id: "pickle",
        uri: "features/a.feature",
        name: "a scenario",
        language: "en",
        astNodeIds: [],
        tags: [],
        steps: each.map(({ id, text }) => ({
          id: `pickle-step-${id}`,
          text,
          astNodeIds: [],
        })),
      },
    },
    {
      testCase: {
        id: "test-case",
        pickleId: "pickle",
        testSteps: each.map(({ id }) => ({
          id: `test-step-${id}`,
          pickleStepId: `pickle-step-${id}`,
          stepDefinitionIds: [],
          stepMatchArgumentsLists: [],
        })),
      },
    },
    ...each.map(({ id, status }): Envelope => ({
      testStepFinished: {
        testCaseStartedId: "started",
        testStepId: `test-step-${id}`,
        testStepResult: {
          status: status as TestStepResultStatus,
          duration: timestamp,
        },
        timestamp,
      },
    })),
  ];
};

/** The run's `parameterType` message for a type the support code defines. */
const parameterType = (
  name: string,
  regularExpressions: string[],
): Envelope => ({
  parameterType: {
    id: name,
    name,
    regularExpressions,
    preferForRegularExpressionMatch: false,
    useForSnippets: true,
  },
});

const color = { name: "color", expression: "a {color} car" };

/** `usedMissingTypes` of the run `envelopes`. */
const usedOf = (
  envelopes: Envelope[],
  missing: readonly UndefinedParameterType[],
) => usedMissingTypes(createQuery(envelopes), missing);

describe("usedMissingTypes", () => {
  test("a missing type an undefined step could use", () => {
    expect(usedOf(runOf(["a red car"]), [color])).toEqual([color]);
  });

  test("not a missing type no undefined step could use", () => {
    expect(usedOf(runOf(["a red bike"]), [color])).toEqual([]);
  });

  test("only undefined steps count", () => {
    expect(
      usedOf(runOf([["a red car", "PASSED"], "an undefined step"]), [color]),
    ).toEqual([]);
  });

  test("of several, the ones an undefined step could use", () => {
    const airport = {
      name: "airport",
      expression: "{airport} is closed because of a strike",
    };
    expect(
      usedOf(
        runOf(["an undefined step", "CDG is closed because of a strike"]),
        [color, airport],
      ),
    ).toEqual([airport]);
  });

  test("a name no parameter type may have (`{order.id}`): listed, as cucumber lists it", () => {
    const order = { name: "order.id", expression: "an order of {order.id}" };
    expect(usedOf(runOf(["an order of 42"]), [order])).toEqual([order]);
  });

  test("a built-in type next to it keeps its own pattern", () => {
    const fruit = { name: "fruit", expression: "I have {int} {fruit}" };
    expect(usedOf(runOf(["I have 3 apples"]), [fruit])).toEqual([fruit]);
    expect(usedOf(runOf(["I have many apples"]), [fruit])).toEqual([]);
  });

  test("a defined type next to it keeps its pattern, from its message", () => {
    const delay = {
      name: "delay",
      expression: "{flight} is delayed by {delay}",
    };
    const flight = parameterType("flight", ["[A-Z]{3}-[A-Z]{3}"]);
    expect(
      usedOf([flight, ...runOf(["LHR-CDG is delayed by an hour"])], [delay]),
    ).toEqual([delay]);
    expect(
      usedOf([flight, ...runOf(["the flight is delayed by an hour"])], [delay]),
    ).toEqual([]);
  });

  test("an expression with another missing type than its message's (cucumber names the first)", () => {
    const airport = {
      name: "airport",
      expression: "{airport} closed by {cause}",
    };
    expect(usedOf(runOf(["CDG closed by a strike"]), [airport])).toEqual([
      airport,
    ]);
  });

  test("optional text and alternatives, as cucumber matches them", () => {
    const fruit = {
      name: "fruit",
      expression: "I eat (a lot of ){fruit} every day/week",
    };
    expect(usedOf(runOf(["I eat a lot of apples every day"]), [fruit])).toEqual(
      [fruit],
    );
    expect(usedOf(runOf(["I eat apples every week"]), [fruit])).toEqual([
      fruit,
    ]);
    expect(usedOf(runOf(["I eat apples every month"]), [fruit])).toEqual([]);
  });

  test("an expression it can't build, listed", () => {
    // Cucumber dropped the definition for its missing type; the stand-in can't fix the rest.
    const fruit = { name: "fruit", expression: "I eat {fruit}/fruits" };
    expect(usedOf(runOf(["an undefined step"]), [fruit])).toEqual([fruit]);
  });
});
