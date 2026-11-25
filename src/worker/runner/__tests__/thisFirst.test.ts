import { expect, test } from "vitest";
import type { Code } from "../../../types/supportCode.ts";
import { takesFirst } from "../thisFirst.ts";

/** A function made from `text` (as a transform would leave it), unformatted. */
const codeOf = (text: string) => new Function(`return (${text})`)() as Code;

test("an arrow function whose first parameter is named `world`", () => {
  for (const text of [
    "world => {}",
    "(world) => {}",
    "(world, count) => {}",
    "async world => {}",
    "async (world, count) => {}",
    "async(world)=>{}",
    "(world = {}) => {}",
    // A type annotation Node stripped: blank space in its place.
    "(world      , count        ) => {}",
    "(\n  world,\n  count,\n) => {}",
  ]) {
    expect(takesFirst(codeOf(text), "world"), text).toBe(true);
  }
});

test("any other function is cucumber's own call", () => {
  for (const text of [
    "() => {}",
    "(count, world) => {}",
    "(cart) => {}",
    "(worldwide) => {}",
    "({ world }) => {}",
    "([world]) => {}",
    "(...world) => {}",
    "(/* the cart */ world) => {}",
    "async => {}",
    "function (world) {}",
    "function world() {}",
    "async function (world) {}",
    "function* (world) {}",
    "({ world(count) {} }).world",
    "({ async world(count) {} }).world",
    "class world {}",
    "((world) => {}).bind(null)",
  ]) {
    expect(takesFirst(codeOf(text), "world"), text).toBe(false);
  }
});

test("a test run hook's: `context`", () => {
  expect(takesFirst(codeOf("(context) => {}"), "context")).toBe(true);
  expect(takesFirst(codeOf("(world) => {}"), "context")).toBe(false);
  expect(takesFirst(codeOf("(context) => {}"), "world")).toBe(false);
});
