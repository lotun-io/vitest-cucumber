import { processError } from "@vitest/utils/error";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, test } from "vitest";
import type { Failure } from "../../../../types/platform.ts";
import { bigIntsAsText } from "../bigIntsAsText.ts";
import { vitestThrown } from "../serializedErrors.ts";
import { frameAt } from "../stacks.ts";
import { originalThrown } from "../thrown.ts";

const node = vitestThrown();
const page = vitestThrown(bigIntsAsText);
const step = frameAt("/project/features/a.feature", { line: 3, column: 5 });
const stepLine = "    at /project/features/a.feature:3:5";

type Copy = Record<string, unknown>;

/** A failing `expect` on two Sets: chai's AssertionError, which has its own `toJSON`. */
const setsDiffer = () => {
  try {
    expect(new Set([1, 2])).toEqual(new Set([1, 3]));
  } catch (error) {
    return error as Error & { expected: unknown; cause?: unknown };
  }
  throw new Error("the sets are equal");
};

/** The diff Vitest's runner makes of a copy (`processError`, on the copy). */
const diffOf = (copy: Copy | undefined) =>
  stripVTControlCharacters(
    (processError(copy) as { diff?: string }).diff ?? "",
  );

/** Vitest's diff of `setsDiffer`'s Sets. */
const setDiff = "-   3,\n+   2,";

/** An error with `stack` as its stack. */
const errorWithStack = (message: string, stack: string) =>
  Object.assign(new Error(message), { stack });

/** Whether a BigInt is reachable from `value`. */
const reachesBigInt = (value: unknown, seen = new Set<unknown>()): boolean => {
  if (typeof value === "bigint") return true;
  if (typeof value !== "object" || value === null || seen.has(value))
    return false;
  seen.add(value);
  return Object.values(value).some((each) => reachesBigInt(each, seen));
};

describe("a Vitest host: copies as Vitest serializes them", () => {
  test("one error: a plain copy (name, message, stack, properties), the original left alone", () => {
    const error = Object.assign(new TypeError("broken"), { code: "E1" });
    const copy = node([{ value: error }], "a scenario") as Copy;
    expect(copy).not.toBe(error);
    expect(copy).not.toBeInstanceOf(Error);
    expect(copy).toMatchObject({
      name: "TypeError",
      message: "broken",
      stack: error.stack,
      code: "E1",
    });
  });

  test("a step's line first in the copy's stack; the original's stack untouched", () => {
    const error = errorWithStack(
      "failed",
      "Error: failed\n    at step (/p/steps.ts:4:9)",
    );
    const copy = node([{ value: error, frame: step }], "a scenario") as Copy;
    expect(copy.stack).toBe(
      `Error: failed\n${stepLine}\n    at step (/p/steps.ts:4:9)`,
    );
    expect(error.stack).toBe("Error: failed\n    at step (/p/steps.ts:4:9)");
  });

  test("an empty stack: the step's line as its frame", () => {
    const copy = node(
      [{ value: errorWithStack("failed", ""), frame: step }],
      "a scenario",
    ) as Copy;
    expect(copy.stack).toBe(`\n${stepLine}`);
  });

  test("an assertion's expected and actual: the originals (Vitest's diff), as values Vitest would flatten", () => {
    const expected = new Set([1, 3]);
    const actual = new Set([1, 2]);
    const error = Object.assign(new Error("differs"), { expected, actual });
    const copy = node([{ value: error }], "a scenario") as Copy;
    expect(copy.expected).toBe(expected);
    expect(copy.actual).toBe(actual);
  });

  test("a failing expect (chai's AssertionError, copied through its toJSON): Vitest's diff from the originals, on the error, a cause and an AggregateError's member", () => {
    const failing = () => setsDiffer();
    const cause = failing();
    const member = failing();
    const failures: Failure[] = [
      { value: failing() },
      { value: new Error("with a cause", { cause }) },
      { value: new AggregateError([member], "several") },
    ];
    const [own, withCause, , inAggregate] = (
      node(failures, "a scenario") as AggregateError
    ).errors as Copy[];
    expect(diffOf(own)).toContain(setDiff);
    expect(diffOf(withCause?.cause as Copy)).toContain(setDiff);
    expect(diffOf(inAggregate)).toContain(setDiff);
    expect(cause.expected).toBeInstanceOf(Set);
    expect(member).not.toHaveProperty("diff");
  });

  test("an AssertionError in a cause cycle: each of its copies (its toJSON unrolls the cycle once) with the originals", () => {
    const error = setsDiffer();
    error.cause = new Error("back", { cause: error });
    const copy = node([{ value: error }], "a scenario") as Copy;
    const again = (copy.cause as Copy).cause as Copy;
    expect(again.expected).toBe(error.expected);
    expect(diffOf(copy)).toContain(setDiff);
  });

  test("a user's AggregateError: its head (no errors, not an AggregateError), then its members, each with the step's line", () => {
    const nested = new AggregateError([new Error("deep")], "inner");
    const aggregate = new AggregateError(
      [errorWithStack("first", "Error: first\n    at f (/p/a.ts:1:1)"), nested],
      "outer",
      { cause: "why" },
    );
    const thrown = node(
      [{ value: aggregate, frame: step }],
      "a scenario",
    ) as AggregateError;
    expect(thrown).toBeInstanceOf(AggregateError);
    const [head, first, inner] = thrown.errors as Copy[];
    expect(head).toMatchObject({
      name: "AggregateError",
      message: "outer",
      cause: "why",
    });
    expect(head).not.toHaveProperty("errors");
    expect(head).not.toBeInstanceOf(AggregateError);
    expect(first?.stack).toBe(
      `Error: first\n${stepLine}\n    at f (/p/a.ts:1:1)`,
    );
    // A nested one as Vitest prints it: one error, its errors as data.
    expect(inner).toMatchObject({ message: "inner" });
    expect(inner?.errors).toHaveLength(1);
    expect(aggregate.errors).toHaveLength(2);
  });

  test("an empty AggregateError: its head alone, as the error", () => {
    const copy = node(
      [{ value: new AggregateError([], "none") }],
      "BeforeAll",
    ) as Copy;
    expect(copy).toMatchObject({ name: "AggregateError", message: "none" });
  });

  test("several failures: one AggregateError (Vitest spreads it)", () => {
    const thrown = node(
      [{ value: new Error("one") }, { value: new Error("two") }],
      "AfterAll",
    ) as AggregateError;
    expect(thrown.message).toBe("AfterAll: 2 errors");
    expect((thrown.errors as Copy[]).map(({ message }) => message)).toEqual([
      "one",
      "two",
    ]);
  });

  test("node mode: BigInts as they are (V8 carries them)", () => {
    const copy = node(
      [{ value: Object.assign(new Error("x"), { n: 1n }) }],
      "x",
    ) as Copy;
    expect(copy.n).toBe(1n);
  });
});

describe("a page: BigInts as text", () => {
  test("each BigInt as its text: properties, nested data, class instances, the error's getters, its cause", () => {
    class Money {
      readonly #cents = 100;
      amount = 10n;
      get display() {
        return `€${String(this.#cents / 100)}`;
      }
    }
    class PaymentError extends Error {
      get owed() {
        return 5n;
      }
    }
    const error = Object.assign(
      new PaymentError("payment", {
        cause: Object.assign(new Error("why"), { id: 2n }),
      }),
      { amount: 1n, nested: { list: [3n, "text"] }, price: new Money() },
    );
    const copy = page([{ value: error }], "x") as Copy;
    expect(copy).toMatchObject({
      amount: "1n",
      owed: "5n",
      nested: { list: ["3n", "text"] },
      price: { amount: "10n", display: "€1" },
      cause: { id: "2n" },
    });
    expect(reachesBigInt(copy)).toBe(false);
    expect(error.amount).toBe(1n);
  });

  test("an assertion's expected and actual left to Vitest (it prints them itself)", () => {
    const expected = { amount: 2n };
    const copy = page(
      [
        {
          value: Object.assign(new Error("differs"), { expected, actual: 1n }),
        },
      ],
      "x",
    ) as Copy;
    expect(copy.expected).toBe(expected);
    expect(copy.actual).toBe(1n);
    expect(expected.amount).toBe(2n);
  });

  test("a cycle kept (flatted carries it), no BigInt left", () => {
    const data = { n: 5n, self: undefined as unknown };
    data.self = data;
    const copy = page(
      [{ value: Object.assign(new Error("cyclic"), { data }) }],
      "x",
    ) as {
      data: { n: unknown; self: unknown };
    };
    expect(copy.data.n).toBe("5n");
    expect(copy.data.self).toBe(copy.data);
  });

  test("data deeper than the stack: no error of the plugin's (Vitest's serialization truncates it)", () => {
    const root: Record<string, unknown> = {};
    let level = root;
    for (let index = 0; index < 100_000; index++) {
      level.next = {};
      level = level.next as Record<string, unknown>;
    }
    level.amount = 1n;
    expect(() =>
      page([{ value: Object.assign(new Error("deep"), { root }) }], "x"),
    ).not.toThrow();
  });
});

describe("Storybook's preview: the originals", () => {
  test("one: itself; several: one AggregateError of them; no step line added", () => {
    const one = new Error("one");
    const failures: Failure[] = [{ value: one, frame: step }];
    expect(originalThrown(failures, "x")).toBe(one);
    expect(one.stack).not.toContain("a.feature");
    const two = new AggregateError([], "two");
    const thrown = originalThrown(
      [{ value: one }, { value: two }],
      "a scenario",
    ) as AggregateError;
    expect(thrown.message).toBe("a scenario: 2 errors");
    expect(thrown.errors[0]).toBe(one);
    expect(thrown.errors[1]).toBe(two);
  });
});
