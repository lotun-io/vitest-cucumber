// Stand-ins for cucumber's exports a page can't have (its runner's and formatters': `./page.ts`):
// each throws the plugin's error on any use (`unsupportedError`), so importing one works and using
// it fails with a clear reason. (The support code methods the plugin doesn't support,
// `setDefaultTimeout` and `setParallelCanAssign`, are recorded and refused with the call's
// location instead: `./recorders.ts`.) Page-safe.
import { unsupportedError } from "../../utils/errors.ts";

/**
 * The properties read of any value by what only passes it on: `then` (a promise's resolution checks
 * whether a value is one: an `async` function returning it, `await`), `toJSON` (`JSON.stringify`,
 * loggers). Reading them is no use of it: undefined, as a plain value's.
 */
const passedOn = new Set(["then", "toJSON"]);

/**
 * A stand-in for `name` that works as a function, a class or an object, and throws on any use: a
 * call, `new`, reading or writing a property. Reading a symbol, `then` or `toJSON` is allowed
 * (`passedOn`), so it can be inspected, returned from an `async` function and logged.
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
      typeof key === "symbol"
        ? Reflect.get(target, key)
        : passedOn.has(key)
          ? undefined
          : fail(),
    set: fail,
    has: fail,
  }) as T;
};
