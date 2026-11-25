// The one thing the plugin's types of cucumber's hooks can't compute (`../cucumber.d.mts`): how
// many ways cucumber's own method can be called. They read three (`CallsOf`): a fourth fails here
// (`tsc`, part of `pnpm lint`). Never run.
import type * as real from "#cucumber";

/** A method's ways to call it, read as four: one with fewer has its first twice. */
type FourCallsOf<Method> = Method extends {
  (...args: infer A): unknown;
  (...args: infer B): unknown;
  (...args: infer C): unknown;
  (...args: infer D): unknown;
}
  ? [A, B, C, D]
  : never;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AtMostThree<Method> = Same<FourCallsOf<Method>[0], FourCallsOf<Method>[1]>;

/** Cucumber's own hooks (`#cucumber`: the real module), each `true` while it has at most three. */
export const calls: [
  AtMostThree<typeof real.Before>,
  AtMostThree<typeof real.After>,
  AtMostThree<typeof real.BeforeStep>,
  AtMostThree<typeof real.AfterStep>,
  AtMostThree<typeof real.BeforeAll>,
  AtMostThree<typeof real.AfterAll>,
] = [true, true, true, true, true, true];
/** The check isn't empty: as if cucumber added a way to call `Before`. */
type OneMore = ((name: string, tags: string, code: () => void) => void) &
  typeof real.Before;
// @ts-expect-error -- four ways: not `true`
export const added: AtMostThree<OneMore> = true;
