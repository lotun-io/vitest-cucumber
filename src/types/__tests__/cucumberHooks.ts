// Cucumber's hooks as the plugin's types give them (`../cucumber.d.mts`), checked by TypeScript
// alone (`tsc`, part of `pnpm lint`): what must typecheck does, and each `@ts-expect-error` line is
// an error. Never run.
import type * as real from "#cucumber";
import {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeAll,
  BeforeStep,
  Given,
  World,
  type IContext,
  type ITestCaseHookParameter,
} from "@cucumber/cucumber";

class Cart extends World {
  count = 0;
  quit = async () => {};
}

export const worldFirst = () => {
  Before((world: Cart) => {
    world.count = 0;
  });
  Before((world: Cart, { pickle }) => {
    const name: string = pickle.name;
    void [world, name];
  });
  Before((world: Cart, testCase, callback) => {
    void [world, testCase.pickle.name];
    callback();
  });
  After({ tags: "@a" }, (world: Cart) => world.quit());
  After("@a", async (world: Cart, { result }) => {
    await world.quit();
    void result?.status;
  });
  BeforeStep({ tags: "@a" }, (world: Cart) => void world.count);
  AfterStep((world: Cart, { pickleStep, result }) => {
    void [world, pickleStep.text, result.status];
  });
  BeforeAll((context: IContext) => void context.parameters);
  BeforeAll((context: IContext, callback) => {
    void context.parameters;
    callback();
  });
  AfterAll({ timeout: 10 }, async (context: IContext) => {
    await Promise.resolve(context.parameters);
  });
  // A step's arguments are cucumber's `any[]`.
  Given("a step {int}", (world: Cart, count: number) => void [world, count]);

  // @ts-expect-error -- no such property on the World
  Before((world: Cart) => void world.nope);
  Before((world: Cart, { pickle }) => {
    // @ts-expect-error -- the hook's parameter is cucumber's
    const name: number = pickle.name;
    void [world, name];
  });
  // @ts-expect-error -- no such property on the context
  BeforeAll((context: IContext) => void context.nope);
  // @ts-expect-error -- one argument too many
  Before((world: Cart, testCase, callback, extra) => {
    void [world, testCase, callback, extra];
  });
  // @ts-expect-error -- one argument too many
  BeforeAll((context: IContext, callback, extra) => {
    void [context, callback, extra];
  });
};

/** Cucumber's own forms, as its types take them. */
export const cucumbers = () => {
  Before(function (this: Cart) {
    this.count = 0;
  });
  Before<Cart>(function () {
    this.count = 0;
  });
  Before(function () {
    void this.parameters;
  });
  Before(({ pickle }) => void pickle.name);
  Before("@a", function ({ pickle }) {
    void [pickle.name, this.parameters];
  });
  Before(function (testCase, callback) {
    void testCase.pickle;
    callback();
  });
  Before(
    { tags: "@a", timeout: 5 },
    async function (this: Cart, { gherkinDocument }) {
      await this.quit();
      void gherkinDocument.uri;
    },
  );
  AfterStep(function ({ result }) {
    void result.status;
  });
  BeforeAll(function () {
    void this.parameters;
  });
  BeforeAll(() => {});
  BeforeAll((callback) => {
    callback();
  });
  AfterAll({ timeout: 5 }, async function () {
    await Promise.resolve(this.parameters);
  });
  Given("a step", function (this: Cart) {
    void this.count;
  });
  // A function typed elsewhere as cucumber types a hook's, and a helper on cucumber's own types.
  const typed = undefined as unknown as (
    this: Cart,
    arg: ITestCaseHookParameter,
  ) => Promise<void>;
  Before(typed);
  After({ tags: "@a" }, typed);
  const tagged = (tags: string, code: Parameters<typeof Before>[1]) => {
    Before({ tags }, code);
  };
  tagged("@a", function () {});

  // @ts-expect-error -- no such property on the hook's parameter
  Before(({ nope }) => void nope);
  // @ts-expect-error -- a hook's options
  Before({ tags: 1 }, () => {});
  BeforeAll(function () {
    // @ts-expect-error -- no such property on the context
    void this.nope;
  });
};

/**
 * The one thing the declaration can't compute: how many ways cucumber's method can be called. It
 * reads three (`CallsOf`): a method read as four has its first twice while it has no more.
 */
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
