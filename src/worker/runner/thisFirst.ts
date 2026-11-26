// Whether a definition's code takes what cucumber gives it as `this` (a step's or a hook's World, a
// test run hook's context) as its first argument too. The plugin's own, not cucumber's: an arrow
// function has no `this`. The code says so itself, by its first parameter's name (`world`, a test
// run hook's `context`), read from the function's own text: its syntax is all there is of it as it
// runs (TypeScript's types are erased, an annotation can't be the sign), and its length alone can't
// tell the world from cucumber's callback, one more argument too. Only an arrow function: a
// `function` has its `this`. A parameter in a destructuring isn't read: cucumber's own call then.
// No parser: the text is read where the support code loads, a page too, and Vite's is Node's
// alone; the unit test holds the pattern to Vite's reading of the same functions. A minified
// build renames the parameter: Storybook's static build writes a statement into each such
// function first, which a minifier keeps and which names the parameter
// (`../../utils/firstParameterMark.ts`, `../../core/storybook/preset/firstParameterMarks.ts`): the
// text still says it, and is read for that too. Page-safe.
import type { Code } from "../../types/supportCode.ts";

/**
 * An arrow function's first parameter, a plain name (`world => …`, `(world, count) => …`,
 * `async (world = …) => …`), after any comments (a line of its own above it, in a function
 * written over several lines): any other function's text starts with `function`, `class` or a
 * method's name, each followed by something else.
 */
const firstParameter =
  /^(?:async\s*)?\(?(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*([\p{ID_Start}$_][\p{ID_Continue}$]*)\s*(?:[,)=]|$)/u;

/** An arrow function's text, by how it starts: its parameters, or its one parameter and its arrow. */
const arrowFunction =
  /^(?:async\s*)?(?:\(|[\p{ID_Start}$_][\p{ID_Continue}$]*\s*=>)/u;

/**
 * A build's statement (`globalThis["use @lotun/vitest-cucumber:world"]?.()`: what it reads),
 * whatever quotes a minifier gave its key: the name it has.
 */
const statement =
  /globalThis\[(["'`])use @lotun\/vitest-cucumber:(world|context)\1\]/;

/**
 * The name a build's statement gives arrow function `text`'s first parameter, if it has one: first
 * in its body, so before any function written in it (a minifier may join it to what follows: a
 * `return`, a sequence). Read after the text's first arrow, its own (a default value that is an
 * arrow function has one before it: not read, such a step is refused for its arguments), up to
 * the next one, a function's in its body, whose statement is that function's.
 */
const statedFirst = (text: string) => {
  const arrow = arrowFunction.test(text) ? text.indexOf("=>") : -1;
  if (arrow === -1) {
    return undefined;
  }
  const next = text.indexOf("=>", arrow + 2);
  return statement.exec(
    text.slice(arrow + 2, next === -1 ? undefined : next),
  )?.[2];
};

/**
 * Whether `code` is an arrow function whose first parameter is named `name`: by its own text, the
 * parameter's name or, minified, a build's statement.
 */
export const takesFirst = (code: Code, name: "world" | "context") => {
  const text = Function.prototype.toString.call(code);
  return firstParameter.exec(text)?.[1] === name || statedFirst(text) === name;
};
