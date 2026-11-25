import { expect, test } from "vitest";
import type { SupportCall } from "../../../types/supportCode.ts";
import { supportIds } from "../supportIds.ts";

const call = (
  method: string,
  pattern: unknown,
  line: number,
  code: () => void = () => undefined,
): SupportCall => ({
  method,
  args: [pattern, code],
  location: { uri: "features/steps.ts", line, column: 1 },
});

const calls = [
  call("Given", "a cart", 3),
  call("When", /^I pay$/, 7),
  call("Before", { tags: "@smoke" }, 11),
];

/** The first `count` ids of the support code `of` makes. */
const idsOf = (of: readonly SupportCall[], count = 3) => {
  const newId = supportIds(of);
  return Array.from({ length: count }, () => newId());
};

test("the same support code: the same ids, in the same order, in every worker (whatever its functions are)", () => {
  const again = calls.map(({ method, args, location }) => ({
    method,
    // Another worker's own functions.
    args: [args[0], () => "another"],
    location,
  }));
  expect(idsOf(again)).toEqual(idsOf(calls));
});

test("each id its own, a UUID", () => {
  const ids = idsOf(calls);
  expect(new Set(ids).size).toBe(3);
  for (const id of ids) {
    expect(id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  }
});

test("support code that differs (a pattern, a method, a call's place, one more call): other ids, every one", () => {
  const [given, when, before] = calls as [
    SupportCall,
    SupportCall,
    SupportCall,
  ];
  const ids = idsOf(calls);
  const others = [
    [call("Given", "a basket", 3), when, before],
    [call("Then", "a cart", 3), when, before],
    [call("Given", "a cart", 4), when, before],
    [given, call("When", /^I pay now$/, 7), before],
    [...calls, call("After", () => undefined, 15)],
  ];
  for (const other of others) {
    const theirs = idsOf(other);
    expect(theirs.filter((id) => ids.includes(id))).toEqual([]);
  }
});
