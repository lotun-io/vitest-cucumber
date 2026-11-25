import { parseSync } from "vite";
import { expect, test } from "vitest";
import type { Code } from "../../../types/supportCode.ts";
import { takesFirst } from "../thisFirst.ts";

/** The function `text` evaluates to: its own text is as written here, comments and all. */
const codeOf = (text: string) => new Function(`return (${text})`)() as Code;

/** Functions that take the World first. */
const worldFirst = [
  "world => {}",
  "(world) => {}",
  "(world, count) => {}",
  "async world => {}",
  "async (world, count) => {}",
  "async(world)=>{}",
  // Default values, the first parameter's and a later one's.
  "(world = {}) => {}",
  "(world, count = 1) => {}",
  '(world, url = "http://example.test") => {}',
  // A type annotation Node stripped: blank space in its place.
  "(world      , count        ) => {}",
  // Over several lines, with comments.
  "(\n  world,\n  count,\n) => {}",
  "(\n  // The scenario's cart.\n  world,\n  count,\n) => {}",
  "(\n  // One line,\n  // then another.\n  world,\n) => {}",
  "(/* the cart */ world, count) => {}",
  "async (/* the cart */ /* still */ world) => {}",
  // A comment over several lines, and JavaScript's way to give a parameter its type.
  "(\n  /*\n   * The scenario's cart,\n   * one per scenario.\n   */\n  world,\n  count,\n) => {}",
  "(/** @type {Cart} */ world, /** @type {number} */ count) => {}",
  "(\n  /**\n   * @type {Cart}\n   */\n  world,\n) => {}",
  "(\n  // A line,\n  /* then a block */\n  world,\n) => {}",
];

/** Functions called as cucumber calls them. */
const cucumbers = [
  "() => {}",
  "(count, world) => {}",
  "(cart) => {}",
  "(worldwide) => {}",
  "({ world }) => {}",
  "([world]) => {}",
  "(...world) => {}",
  "(/* world */ cart) => {}",
  "async => {}",
  // A `function` has its `this`.
  "function (world) {}",
  "function (world, count) {}",
  "function world() {}",
  "async function (world) {}",
  "function* (world) {}",
  // Functions whose text isn't an expression of its own.
  "({ world(count) {} }).world",
  "({ async world(count) {} }).world",
  "class world {}",
  "((world) => {}).bind(null)",
];

test("an arrow function whose first parameter is named `world`", () => {
  for (const text of worldFirst) {
    expect(takesFirst(codeOf(text), "world"), text).toBe(true);
  }
});

test("any other function is cucumber's own call", () => {
  for (const text of cucumbers) {
    expect(takesFirst(codeOf(text), "world"), text).toBe(false);
  }
});

test("a test run hook's: `context`", () => {
  expect(takesFirst(codeOf("(context) => {}"), "context")).toBe(true);
  expect(takesFirst(codeOf("(world) => {}"), "context")).toBe(false);
  expect(takesFirst(codeOf("(context) => {}"), "world")).toBe(false);
});

test("as a parser reads the same functions (Vite's)", () => {
  /** Whether `code`'s text parses as an arrow function whose first parameter is named `world`. */
  const parsed = (code: Code) => {
    const { program, errors } = parseSync("code.js", `(${String(code)})`);
    const [statement] = program.body;
    // A method's text, a bound function's: no expression of its own.
    if (errors.length > 0 || statement?.type !== "ExpressionStatement") {
      return false;
    }
    const expression =
      statement.expression.type === "ParenthesizedExpression"
        ? statement.expression.expression
        : statement.expression;
    if (expression.type !== "ArrowFunctionExpression") {
      return false;
    }
    const [first] = expression.params;
    const name = first?.type === "AssignmentPattern" ? first.left : first;
    return name?.type === "Identifier" && name.name === "world";
  };
  for (const text of [...worldFirst, ...cucumbers]) {
    const code = codeOf(text);
    expect(takesFirst(code, "world"), text).toBe(parsed(code));
  }
});
