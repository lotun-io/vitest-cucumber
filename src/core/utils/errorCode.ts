// An error of main's as code: a generated module gives an error by making it again where it runs
// (a Vitest worker, a page), every line of it written out. A feature file that can't be used
// (`../feature/plans.ts`'s `FailedPlan`) fails so in every mode: node and browser mode's feature
// module (`../feature/featureModule.ts`), Storybook's stories module
// (`../storybook/stories/featureStoriesModule.ts`).

/**
 * `error`'s text: its stack (main's: where it was thrown), which begins with its message, without
 * its name (the error's own, printed before it); with no stack (the plugin's own errors: no frame
 * would be the user's), or one that hasn't its message (changed since), its message, then the stack.
 */
const textOf = (error: Error) => {
  const { name, message, stack = "" } = error;
  if (!stack) {
    return message;
  }
  if (!stack.includes(message)) {
    return `${message}\n${stack}`;
  }
  return stack.startsWith(`${name}: `) ? stack.slice(name.length + 2) : stack;
};

/**
 * The code of an expression that makes `error` again where the module runs: its name, and as its
 * message its whole text, its stack's frames included (`textOf`), with no stack of its own: a
 * host prints a message as it is, where it reads a stack for frames to show and drops the plugin's
 * (Vitest's: the ones under `node_modules`), so a bug's frames would be lost where the plugin is
 * installed. Its cause too, if it's an error (`seen`: one already written isn't again).
 */
export const errorCode = (error: Error, seen = new Set<Error>()): string => {
  const json = JSON.stringify;
  seen.add(error);
  const { cause } = error;
  const options =
    cause instanceof Error && !seen.has(cause)
      ? `, { cause: ${errorCode(cause, seen)} }`
      : "";
  return `Object.assign(new Error(${json(textOf(error))}${options}), { name: ${json(error.name)}, stack: "" })`;
};

/** The statement that throws `error`, made again (`errorCode`). */
export const throwCode = (error: Error) => `throw ${errorCode(error)};`;

/**
 * The code of a test file that fails with `error` and no tests: a suite whose body throws it, as
 * the suite is collected. Not as the module is imported: Vitest's browser tester wraps an import's
 * error ("Failed to import test file <path>", ours its cause), while the runner takes a suite's as
 * the file's own, in a worker and in a page, so node mode, browser mode and Storybook's story
 * tests print the same. The suite's name is never shown: no suite is made, its body throws first.
 */
export const failingSuiteCode = (error: Error) =>
  [
    `import { describe } from "vitest";`,
    `describe("feature", () => {`,
    `  ${throwCode(error)}`,
    "});",
  ].join("\n");
