// Runs a step's or hook's code as cucumber's user code runner does (a port of 13.3.0's
// `lib/user_code_runner.ts`): a function that takes one more argument than it's given gets a
// callback (any value but `null` or `undefined` is its error); one that returns a promise is awaited;
// both is cucumber's error; anything else is its result as it is. An async one also fails on an
// uncaught error while it runs (the platform's: `RuntimeEnvironment["uncaught"]`), and on its
// timeout (`timeout` < 0: none). A thrown non-Error becomes its text for the result (`error`, for
// cucumber's message: `textOf`, as cucumber's `util.format`); `failure` is the real failure, which the test's error is built from: the value
// the code itself threw, rejected with or passed its callback, or cucumber's own error (both
// interfaces, a timeout). Page-safe.
import { inspect } from "@vitest/utils/display";
import type { RuntimeEnvironment } from "../../types/runtimeEnvironment.ts";
import { wrapPromiseWithTimeout } from "./timeout.ts";

/**
 * A thrown value that isn't an error, as its text: cucumber's `util.format` (a string as it is, any
 * other value as `util.inspect` shows it), page-safe (`inspect`, loupe's). Never throws, unlike
 * `String` (an object without a prototype, a `toString` that throws).
 */
export const textOf = (thrown: unknown) =>
  typeof thrown === "string" ? thrown : inspect(thrown);

/** Whether `value` is a promise, or anything with a `then` (as cucumber tells a promise apart). */
const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  "then" in value &&
  typeof value.then === "function";

export const runUserCode = async ({
  args,
  thisArg,
  fn,
  timeout,
  uncaught,
}: {
  args: readonly unknown[];
  thisArg: unknown;
  fn: (...args: unknown[]) => unknown;
  timeout: number;
  uncaught: RuntimeEnvironment["uncaught"];
}): Promise<{
  error?: Error | string;
  failure?: { value: unknown };
  result?: unknown;
}> => {
  const {
    promise: callbackPromise,
    resolve,
    reject,
  } = Promise.withResolvers<unknown>();
  const argsArray = [
    ...args,
    (error: unknown, result: unknown) => {
      if (error !== undefined && error !== null) {
        reject(error);
      } else {
        resolve(result);
      }
    },
  ];
  let returned: unknown;
  try {
    returned = fn.apply(thisArg, argsArray);
  } catch (thrown) {
    return {
      error: thrown instanceof Error ? thrown : textOf(thrown),
      failure: { value: thrown },
    };
  }
  const callbackInterface = fn.length === argsArray.length;
  const promiseInterface = isThenable(returned);
  if (callbackInterface && promiseInterface) {
    const error = new Error(
      "function uses multiple asynchronous interfaces: callback and promise\n" +
        "to use the callback interface: do not return a promise\n" +
        "to use the promise interface: remove the last argument to the function",
    );
    return { error, failure: { value: error } };
  }
  let running: PromiseLike<unknown>;
  if (callbackInterface) {
    running = callbackPromise;
  } else if (isThenable(returned)) {
    running = returned;
  } else {
    return { result: returned };
  }
  /** The code's own failure, if it failed before its timeout. */
  let own: { value: unknown } | undefined;
  let final = uncaught.race(running).catch((value: unknown) => {
    own = { value };
    throw value;
  });
  if (timeout >= 0) {
    final = wrapPromiseWithTimeout(
      final,
      timeout,
      `function timed out, ensure the ${callbackInterface ? "callback is executed" : "promise resolves"} within ${String(timeout)} milliseconds`,
    );
  }
  try {
    return { result: await final };
  } catch (thrown) {
    const error =
      thrown instanceof Error
        ? thrown
        : thrown !== undefined && thrown !== null
          ? textOf(thrown)
          : new Error("Promise rejected without a reason");
    // The code's own failure, else cucumber's (its timeout).
    return { error, failure: own ?? { value: thrown } };
  }
};
