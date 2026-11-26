// The statement a minified build leaves in an arrow function whose first parameter was named
// `world` or `context`: `globalThis["use @lotun/vitest-cucumber:world"]?.();`, first in its body.
// A minifier renames the parameter, which is all the runtime reads to tell that the function takes
// the World (`../worker/runner/thisFirst.ts`); it can't drop a call, so the function's own text
// still says it, and the runtime reads it there. It does nothing: no such property is ever set,
// so nothing is called. A call, not the property's read alone: a minifier told that reading a
// property does nothing (terser's `pure_getters`, Rolldown's `propertyReadSideEffects: false`)
// drops a read, a `void` of one too. Storybook's static build writes it
// (`../core/storybook/preset/firstParameterMarks.ts`). Anywhere.

/** A first parameter's name that says what the function takes: the World, a test run hook's context. */
export type FirstParameter = "world" | "context";

/** The property the statement reads, naming the parameter (the user's call, 2026-11-26). */
export const firstParameterKey = (name: FirstParameter) =>
  `use @lotun/vitest-cucumber:${name}`;

/** The statement, as a build writes it. */
export const firstParameterStatement = (name: FirstParameter) =>
  `globalThis[${JSON.stringify(firstParameterKey(name))}]?.();`;
