import { parseSync } from "vite";
import { describe, expect, test } from "vitest";
import type { Code } from "../../../types/supportCode.ts";
import {
  firstParameterKey,
  firstParameterStatement,
} from "../../../utils/firstParameterMark.ts";
import { takesFirst } from "../thisFirst.ts";
import { cucumbers, worldFirst } from "./firstParameterFunctions.ts";

/** The function `text` evaluates to: its own text is as written here, comments and all. */
const codeOf = (text: string) => new Function(`return (${text})`)() as Code;

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

describe("a minified build's statement, the parameter renamed", () => {
  /** The statement for `name`, its key in `quote`s. */
  const stated = (name: "world" | "context", quote = '"') =>
    `globalThis[${quote}${firstParameterKey(name)}${quote}]`;

  test("first in the body, whatever quotes the minifier gave its key", () => {
    for (const quote of ['"', "'", "`"]) {
      expect(
        takesFirst(
          codeOf(`(e, t) => { ${stated("world", quote)}; return t; }`),
          "world",
        ),
        quote,
      ).toBe(true);
    }
    expect(takesFirst(codeOf(`async e=>{${stated("world")}}`), "world")).toBe(
      true,
    );
  });

  test("as a build writes it", () => {
    expect(
      takesFirst(
        codeOf(`(e) => { ${firstParameterStatement("world")} }`),
        "world",
      ),
    ).toBe(true);
  });

  test("joined to what follows it: a sequence, a return", () => {
    expect(takesFirst(codeOf(`(e,t)=>(${stated("world")},e+t)`), "world")).toBe(
      true,
    );
    expect(
      takesFirst(codeOf(`e=>{return ${stated("world")},e}`), "world"),
    ).toBe(true);
  });

  test("after the body's directives", () => {
    expect(
      takesFirst(
        codeOf(`e=>{"use server";${stated("world")};return e}`),
        "world",
      ),
    ).toBe(true);
  });

  test("names the parameter: a test run hook's `context`", () => {
    const hook = codeOf(`e=>{${stated("context")}}`);
    expect(takesFirst(hook, "context")).toBe(true);
    expect(takesFirst(hook, "world")).toBe(false);
  });

  test("a function written in the body has its own: not the outer one's", () => {
    const outer = codeOf(`e=>t=>{${stated("world")};return [e,t]}`) as (
      count: number,
    ) => Code;
    expect(takesFirst(outer, "world")).toBe(false);
    expect(takesFirst(outer(1), "world")).toBe(true);
    expect(
      takesFirst(
        codeOf(`e=>{const t=n=>{${stated("world")}};return t}`),
        "world",
      ),
    ).toBe(false);
  });

  test("only an arrow function's", () => {
    expect(
      takesFirst(
        codeOf(`function (e) { return (t) => { ${stated("world")} }; }`),
        "world",
      ),
    ).toBe(false);
    expect(
      takesFirst(
        codeOf(`({ step(e) { return (t) => { ${stated("world")} }; } }).step`),
        "world",
      ),
    ).toBe(false);
  });

  test("without it, a renamed parameter is cucumber's own call", () => {
    expect(takesFirst(codeOf("(e, t) => {}"), "world")).toBe(false);
  });
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
