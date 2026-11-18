// Cucumber's `wrapPromiseWithTimeout` (a copy of 13.3.0's `lib/time.ts`), on the timers the platform had
// when this module loaded (cucumber's `methods`): not a test's fakes. The runtime's timeouts, and the
// stand-ins' export of it. Page-safe.

const timers = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

/** Rejects if `promise` takes longer than `timeoutInMilliseconds`, with `timeoutMessage`. */
export const wrapPromiseWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutInMilliseconds: number,
  timeoutMessage = "",
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
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
