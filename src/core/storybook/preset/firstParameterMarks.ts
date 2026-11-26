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

/** `node` and every node below it. */
function* nodesOf(node: Node): Generator<Node> {
  yield node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        yield* nodesOf(child);
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
      marked.appendRight(afterDirectives(body), statement);
    } else {
      // An expression: a block that returns it, in parentheses (as written after the arrow, its
      // own parentheses with it: a `return` before a line break would return nothing).
      const parameters = nodesIn(node.params);
      const arrow = code.indexOf("=>", parameters.at(-1)?.end ?? node.start);
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
    const marked = markedCode(code, this.parse(code));
    return (
      marked && {
        code: marked.toString(),
        map: marked.generateMap({ hires: true }),
      }
    );
  },
});
