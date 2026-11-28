// Storybook's static build (`storybook build`) minifies the preview, the support code with it: a
// step's or a hook's first parameter is no longer named `world` (a test run hook's `context`),
// and its name in the function's own text is all the runtime has to tell that the code takes the
// World as an argument (`../../../worker/runner/thisFirst.ts`). So before the minifier runs, each
// such function gets a statement that says it, first in its body (after its directives: a
// statement before one would make it a plain string):
//
//   (world, count) => { … }           (world, count) => { globalThis["use …:world"]?.(); … }
//   (world, count) => world.add(count) (world, count) => { globalThis["use …:world"]?.(); return (world.add(count)); }
//
// A minifier keeps a call (`../../../utils/firstParameterMark.ts`), so the function's text
// still says it afterwards, and the runtime reads it there as it reads the name everywhere else.
// The functions are the ones the runtime's pattern reads (an arrow function whose first parameter
// is a plain name, with a default value or not: the unit test holds the two to each other), found
// by the bundler's own parser, each where it's written: however it reaches `Given` (a helper's
// export, a factory's result), no call is followed. In every script the build bundles, a
// package's too (steps a support file imports from one: nothing says which package has them, and
// a function that is no step's code only reads a property nothing sets), but the plugin's own. A
// build only: wherever else the support code loads (story tests, `storybook dev`, node and
// browser mode) it isn't minified. The minifier's own settings are the project's (the user's
// calls, 2026-11-26).
import MagicString from "magic-string";
import type { Plugin } from "vitest/config";
import {
  type FirstParameter,
  firstParameterStatement,
} from "../../../utils/firstParameterMark.ts";
import { slash } from "../../../utils/slash.ts";
import { ownRoot } from "../../utils/ownModule.ts";
import { withoutQuery } from "../../utils/withoutQuery.ts";

/** The names a first parameter is marked for. */
const isFirstParameter = (name: string): name is FirstParameter =>
  name === "world" || name === "context";

/** A parsed node (ESTree's), with where it is in its code. */
interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string" &&
  "start" in value &&
  typeof value.start === "number" &&
  "end" in value &&
  typeof value.end === "number";

/** `value`'s nodes, if it's a list of them. */
const nodesIn = (value: unknown): Node[] =>
  Array.isArray(value) ? value.filter(isNode) : [];

/** An arrow function's first parameter's name, if it's a plain one (with a default value or not). */
const firstNameOf = (arrow: Node) => {
  const [first] = nodesIn(arrow.params);
  const parameter = first?.type === "AssignmentPattern" ? first.left : first;
  return isNode(parameter) &&
    parameter.type === "Identifier" &&
    typeof parameter.name === "string"
    ? parameter.name
    : undefined;
};

/**
 * `root` and every node below it, each before the nodes below it, in the order they're written.
 * A stack of its own, not a call per level: a module's tree can be deeper than the call stack (a
 * long `a + b + …` chain, generated code), and the bundler's whole build stops on a throw here.
 */
function* nodesOf(root: Node): Generator<Node> {
  const stack = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    yield node;
    const children = Object.values(node).flatMap((value: unknown) =>
      (Array.isArray(value) ? value : [value]).filter(isNode),
    );
    // One by one, last first (a spread of a long list, a big array literal's, would overflow too).
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
}

/** Whether `statement` is a directive: a string alone, among a body's first statements. */
const isDirective = (statement: Node) =>
  statement.type === "ExpressionStatement" &&
  isNode(statement.expression) &&
  statement.expression.type === "Literal" &&
  typeof statement.expression.value === "string";

/** Where a block body's own statements start: after its `{` and its directives. */
const afterDirectives = (block: Node) => {
  let offset = block.start + 1;
  for (const statement of nodesIn(block.body)) {
    if (!isDirective(statement)) {
      break;
    }
    offset = statement.end;
  }
  return offset;
};

/**
 * Where the arrow after an arrow function's parameters is, from `from` (its last parameter's end):
 * only whitespace, comments, a `,` and the `)` come before it, a comment's `=>` none.
 */
const arrowAfter = (code: string, from: number) => {
  let at = from;
  while (at < code.length && !code.startsWith("=>", at)) {
    if (code.startsWith("//", at)) {
      const end = code.indexOf("\n", at);
      at = end === -1 ? code.length : end;
    } else if (code.startsWith("/*", at)) {
      const end = code.indexOf("*/", at + 2);
      at = end === -1 ? code.length : end + 2;
    } else {
      at += 1;
    }
  }
  return at;
};

/**
 * `code` (JavaScript, parsed: its `program`) with the statement in each arrow function whose
 * first parameter is named `world` or `context`; none in it: nothing.
 */
export const markedCode = (code: string, program: unknown) => {
  /** Each such function with its name, an outer one before the ones inside it. */
  const functions = [...(isNode(program) ? nodesOf(program) : [])].flatMap(
    (node) => {
      const name =
        node.type === "ArrowFunctionExpression" ? firstNameOf(node) : undefined;
      return name !== undefined && isFirstParameter(name) && isNode(node.body)
        ? [{ node, body: node.body, name }]
        : [];
    },
  );
  if (functions.length === 0) {
    return undefined;
  }
  const marked = new MagicString(code);
  // The innermost first: a function that is another's body ends where it ends, and what is
  // written at one place is written in order.
  for (const { node, body, name } of functions.reverse()) {
    const statement = firstParameterStatement(name);
    if (body.type === "BlockStatement") {
      const at = afterDirectives(body);
      // After a directive written without its `;` (`"use strict"` and a line break), one first: the
      // two would be one statement.
      const after = at > body.start + 1 && code[at - 1] !== ";" ? ";" : "";
      marked.appendRight(at, `${after}${statement}`);
    } else {
      // An expression: a block that returns it, in parentheses (as written after the arrow, its
      // own parentheses with it: a `return` before a line break would return nothing).
      const arrow = arrowAfter(
        code,
        nodesIn(node.params).at(-1)?.end ?? node.start,
      );
      marked.appendRight(arrow + 2, `{${statement}return (`);
      marked.appendRight(node.end, ");}");
    }
  }
  return marked;
};

/** A module that is a script (the feature files' and Storybook's own modules aren't). */
const script = /\.[cm]?[jt]sx?$/;

/** The plugin's own modules' folder, as Vite writes ids. */
const own = `${slash(ownRoot)}/`;

/** Whether module `file` is one whose functions are marked: a script, not the plugin's own. */
const marks = (file: string) => script.test(file) && !file.startsWith(own);

/** The preview's build's plugin: the support code's World-taking functions, each saying so. */
export const firstParameterMarks = (): Plugin => ({
  name: "vitest-cucumber:storybook-first-parameter-marks",
  apply: "build",
  // After the transforms that make a module JavaScript (TypeScript, JSX), before the minifier
  // (which runs on the chunks).
  enforce: "post",
  transform(code, id) {
    // A module that names neither parameter has no such function: not parsed.
    if (
      !marks(withoutQuery(id)) ||
      !(code.includes("world") || code.includes("context"))
    ) {
      return undefined;
    }
    let program;
    try {
      program = this.parse(code);
    } catch {
      // A module the bundler's parser refuses here (it parses as a module what may be a script: a
      // CommonJS file's top-level `return`): left as it is, its functions unmarked; the build is
      // the bundler's to make or stop.
      return undefined;
    }
    const marked = markedCode(code, program);
    return (
      marked && {
        code: marked.toString(),
        map: marked.generateMap({ hires: true }),
      }
    );
  },
});
