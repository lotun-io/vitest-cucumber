// Whether a definition's code takes what cucumber gives it as `this` (a step's or a hook's World, a
// test run hook's context) as its first argument too. The plugin's own, not cucumber's: an arrow
// function has no `this`. The code says so itself, by its first parameter's name (`world`, a test
// run hook's `context`), read from the function's own text: its syntax is all there is of it as it
// runs (TypeScript's types are erased, an annotation can't be the sign), and its length alone can't
// tell the world from cucumber's callback, one more argument too. Only an arrow function: a
// `function` has its `this`. A parameter in a destructuring isn't read: cucumber's own call then.
// No parser: the text is read where the support code loads, a page too, and Vite's is Node's
// alone; the unit test holds the pattern to Vite's reading of the same functions. Page-safe.
import type { Code } from "../../types/supportCode.ts";

/**
 * An arrow function's first parameter, a plain name (`world => …`, `(world, count) => …`,
 * `async (world = …) => …`), after any comments (a line of its own above it, in a function
 * written over several lines): any other function's text starts with `function`, `class` or a
 * method's name, each followed by something else.
 */
const firstParameter =
  /^(?:async\s*)?\(?(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*([\p{ID_Start}$_][\p{ID_Continue}$]*)\s*(?:[,)=]|$)/u;

/** Whether `code` is an arrow function whose first parameter is named `name`. */
export const takesFirst = (code: Code, name: "world" | "context") =>
  firstParameter.exec(Function.prototype.toString.call(code))?.[1] === name;
