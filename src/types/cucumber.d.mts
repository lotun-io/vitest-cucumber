// `@cucumber/cucumber`'s types in a project that has the plugin's: cucumber's own, but its hooks
// (`Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAll`, `AfterAll`), which also take a
// function whose first argument is the World (a test run hook's: its context), as the runtime
// calls one (`../worker/runner/thisFirst.ts`). A step's function needs none of it: cucumber types
// its arguments `any[]`. An ambient declaration (no import or export of the file's own), which
// TypeScript takes before the module in `node_modules`. Inside it `@cucumber/cucumber` is the
// declaration itself, so cucumber's own types come by another name for the same module, the
// package's import `#cucumber` (`package.json`'s `imports`): cucumber's public entry, nothing of
// its `lib/`. Nothing of cucumber's is written again: each hook's type is computed from cucumber's
// own method (the arguments before its code, what its code is called with, its `this`), so it is
// the installed cucumber's. What can't be computed: how many ways a method can be called (read as
// three: `__tests__/cucumberHooks.ts` fails at a fourth) and the World's default type. A
// project's TypeScript has the file once it has the plugin's types (`../index.ts` refers to it: a
// file importing the plugin, or `"types": ["@lotun/vitest-cucumber"]`).
declare module "@cucumber/cucumber" {
  export * from "#cucumber";
  import type * as cucumber from "#cucumber";

  /** Cucumber's callback interface: any value but `null` or `undefined` is the error. */
  type Callback = (error?: unknown, result?: unknown) => void;

  /**
   * The arguments of each way to call one of cucumber's methods (its overloads), read as three: a
   * scenario's or a step's hook has `(code)`, `(tags, code)` and `(options, code)`; a test run
   * hook, with two, its first twice.
   */
  type CallsOf<Method> = Method extends {
    (...args: infer First): unknown;
    (...args: infer Second): unknown;
    (...args: infer Third): unknown;
  }
    ? [First, Second, Third]
    : never;
  /** A call's arguments before its last, the code. */
  type Leading<Call> = Call extends [...infer Rest, unknown] ? Rest : never;
  /** A method's code as cucumber types it: the last argument of its last call. */
  type CodeOf<Method> = CallsOf<Method>[2] extends [...unknown[], infer Code]
    ? Code
    : never;
  /** A list's first, read once the list is known (`List[0]` of an open list is read too early). */
  type Head<List> = List extends [infer First, ...unknown[]] ? First : never;
  type Tail<List> = List extends [unknown, ...infer Rest] ? Rest : [];

  /** What cucumber calls a method's code with, then its callback. */
  type Passed<Method> = [
    ...Parameters<Extract<CodeOf<Method>, (...args: never) => unknown>>,
    callback: Callback,
  ];

  /**
   * A method's code. Cucumber's own arguments (`First` its default, their first). Or, its first
   * argument annotated as anything else: that one (the World, a test run hook's context), then
   * cucumber's. One signature for both: TypeScript reads the annotation before it types the other
   * parameters, where two overloads would have typed them by the first.
   */
  type Code<This, Method, First> = (
    this: This,
    first: First,
    ...rest: First extends Head<Passed<Method>>
      ? Tail<Passed<Method>>
      : Passed<Method>
  ) => any;

  /** A scenario's or a step's hook: each of cucumber's calls, its code as above. */
  interface Hook<Method> {
    <WorldType = cucumber.IWorld, First = Head<Passed<Method>>>(
      ...args: [
        ...Leading<CallsOf<Method>[0]>,
        code: Code<WorldType, Method, First>,
      ]
    ): void;
    <WorldType = cucumber.IWorld, First = Head<Passed<Method>>>(
      ...args: [
        ...Leading<CallsOf<Method>[1]>,
        code: Code<WorldType, Method, First>,
      ]
    ): void;
    <WorldType = cucumber.IWorld, First = Head<Passed<Method>>>(
      ...args: [
        ...Leading<CallsOf<Method>[2]>,
        code: Code<WorldType, Method, First>,
      ]
    ): void;
  }

  /** A test run hook: its two calls, its `this` cucumber's own (its context). */
  interface TestRunHook<Method> {
    <First = Head<Passed<Method>>>(
      ...args: [
        ...Leading<CallsOf<Method>[1]>,
        code: Code<ThisParameterType<CodeOf<Method>>, Method, First>,
      ]
    ): void;
    <First = Head<Passed<Method>>>(
      ...args: [
        ...Leading<CallsOf<Method>[2]>,
        code: Code<ThisParameterType<CodeOf<Method>>, Method, First>,
      ]
    ): void;
  }

  export const Before: Hook<typeof cucumber.Before>;
  export const After: Hook<typeof cucumber.After>;
  export const BeforeStep: Hook<typeof cucumber.BeforeStep>;
  export const AfterStep: Hook<typeof cucumber.AfterStep>;
  export const BeforeAll: TestRunHook<typeof cucumber.BeforeAll>;
  export const AfterAll: TestRunHook<typeof cucumber.AfterAll>;
}
