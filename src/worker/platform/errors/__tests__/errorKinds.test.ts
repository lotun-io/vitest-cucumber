import { expect, test } from "vitest";
import { isAggregate, isError } from "../errorKinds.ts";

test("isAggregate: an AggregateError, or one from another realm (its name and errors)", () => {
  expect(isAggregate(new AggregateError([], "x"))).toBe(true);
  expect(isAggregate({ name: "AggregateError", errors: [] })).toBe(true);
  expect(isAggregate({ name: "AggregateError" })).toBe(false);
  expect(isAggregate(new Error("x"))).toBe(false);
  expect(isAggregate(null)).toBe(false);
});

test("isError: an Error, or an object with a string stack (another realm's, a copy)", () => {
  expect(isError(new Error("x"))).toBe(true);
  expect(isError({ stack: "Error: x" })).toBe(true);
  expect(isError({ stack: 1 })).toBe(false);
  expect(isError("x")).toBe(false);
  expect(isError(null)).toBe(false);
});
