// Cucumber's support code methods the plugin doesn't support, in every mode (node mode's worker and
// the page get the same: `../node/replacement.ts`, `./page.ts`): `setDefaultTimeout` and
// `setParallelCanAssign`, which would change how the plugin runs. Each is a stand-in that throws the
// plugin's error on any use (`unsupportedError`), so importing one works and calling it fails with a
// clear reason; `unsupported` makes one (the page's stand-ins for what it can't have, too). Page-safe.
import type * as Cucumber from "@cucumber/cucumber";
import { unsupportedError } from "../../utils/errors.ts";

/**
 * A stand-in for `name` that works as a function, a class or an object, and throws on any use: a
 * call, `new`, reading or writing a property. Reading a symbol is allowed, so it can be inspected.
 */
export const unsupported = <T>(name: string): T => {
  const fail = (): never => {
    throw unsupportedError(name);
  };
  // A `function` target, not an arrow, so `new` reaches the proxy too.
  return new Proxy(function () {}, {
    apply: fail,
    construct: fail,
    get: (target, key) =>
      typeof key === "symbol" ? Reflect.get(target, key) : fail(),
    set: fail,
    has: fail,
  }) as T;
};

// Support code methods: refused at the call (Vitest's `testTimeout` and `hookTimeout` are the default
// timeouts; Vitest assigns the feature files to its workers).
export const setDefaultTimeout =
  unsupported<typeof Cucumber.setDefaultTimeout>("setDefaultTimeout");
export const setParallelCanAssign = unsupported<
  typeof Cucumber.setParallelCanAssign
>("setParallelCanAssign");
