// Cucumber's `world` and `context` for the plugin's `@cucumber/cucumber` stand-in, both modes: proxies
// to the running test case's World and the running BeforeAll or AfterAll hook's context, as the
// runtime's scope keeps them (`Scope`: each platform's, `RuntimeEnvironment["scope"]`; the runner
// uses it: `useScope`). Page-safe.
import type * as Cucumber from "@cucumber/cucumber";
import type { Scope } from "../../types/runtimeEnvironment.ts";

/** The runtime's scope, if one runs. */
let current: Scope | undefined;

/** Makes `world` and `context` read `scope` (the runtime's, as it's created). */
export const useScope = (scope: Scope) => {
  current = scope;
};

/** A proxy that forwards every operation to `getThing()` (cucumber's own `makeProxy`). */
const makeProxy = <T extends object>(getThing: () => object): T =>
  new Proxy(
    {},
    {
      defineProperty: (_, property, attributes) =>
        Reflect.defineProperty(getThing(), property, attributes),
      deleteProperty: (_, property) =>
        Reflect.deleteProperty(getThing(), property),
      get: (_, property) => Reflect.get(getThing(), property, getThing()),
      getOwnPropertyDescriptor: (_, property) =>
        Reflect.getOwnPropertyDescriptor(getThing(), property),
      getPrototypeOf: () => Reflect.getPrototypeOf(getThing()),
      has: (_, key) => Reflect.has(getThing(), key),
      isExtensible: () => Reflect.isExtensible(getThing()),
      ownKeys: () => Reflect.ownKeys(getThing()),
      preventExtensions: () => Reflect.preventExtensions(getThing()),
      set: (_, property, value) =>
        Reflect.set(getThing(), property, value, getThing()),
      setPrototypeOf: (_, proto) => Reflect.setPrototypeOf(getThing(), proto),
    },
  ) as T;

/** The running step's or case-level hook's World, with cucumber's error outside one. */
export const world = makeProxy<typeof Cucumber.world>(() => {
  const running = current?.world();
  if (!running) {
    throw new Error(
      "Attempted to access `world` from incorrect scope; only applicable to steps and case-level hooks",
    );
  }
  return running;
});
/** The running BeforeAll or AfterAll hook's context, with cucumber's error outside one. */
export const context = makeProxy<typeof Cucumber.context>(() => {
  const running = current?.context();
  if (!running) {
    throw new Error(
      "Attempted to access `context` from incorrect scope; only applicable to run-level hooks",
    );
  }
  return running;
});
