// Cucumber's `wrapPromiseWithTimeout` (a copy of 13.3.0's `lib/time.ts`), on the host's real timers
// (cucumber's `methods`: `./realTimers.ts`, saved before a project's setup files could fake them): not
// a test's fakes. The runtime's timeouts, and the stand-ins' export of it. Page-safe.
import { realTimers } from "./realTimers.ts";

const timers = realTimers();

/** Rejects if `promise` takes longer than `timeoutInMilliseconds`, with `timeoutMessage`. */
export const wrapPromiseWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutInMilliseconds: number,
  timeoutMessage = "",
): Promise<T> => {
  let timeoutId: unknown;
  if (timeoutMessage === "") {
    timeoutMessage = `Action did not complete within ${String(timeoutInMilliseconds)} milliseconds`;
  }
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = timers.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutInMilliseconds);
  });
  return await Promise.race([promise, timeoutPromise]).finally(() => {
    timers.clearTimeout(timeoutId);
  });
};
