// The real errors behind a failed result, on the message itself: a test step's or test run hook's
// result, or a run's `testRunFinished` (a crash). Under a symbol key, so a message's JSON (and a
// structured clone) never has them: the messages stay cucumber's, the runtime keeps the originals
// (what the user's code threw, rejected with or passed its callback, or cucumber's own error: a
// timeout, a wrong arity), which Vitest shows as they are (`../platform/errors/testErrors.ts`). Page-safe.

/** The key of a message's failures. */
const failuresKey = Symbol("@lotun/vitest-cucumber/failures");

/** `message` with `failures` as its failures (none: it as it is). */
export const withFailures = <T extends object>(
  message: T,
  failures: readonly unknown[],
): T =>
  failures.length === 0
    ? message
    : Object.assign(message, { [failuresKey]: failures });

/** `message`'s failures, in order (none if it has none). */
export const failuresOf = (message: object | undefined): readonly unknown[] => {
  const failures =
    message && failuresKey in message ? message[failuresKey] : undefined;
  return Array.isArray(failures) ? failures : [];
};
