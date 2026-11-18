// What a thrown value is, as Vitest's printer and runner see it: an error (one from another realm,
// a page's or a VM's, or a copy of one: anything with a string stack), and an AggregateError (Vitest
// spreads one a test or hook throws into its members and drops it: its message, stack and cause; an
// empty one shows nothing, so a Vitest host sends a user's as its head, then its members:
// `./serializedErrors.ts`). Page-safe.

/**
 * Whether Vitest can print `value` as an error: an `Error`, or else an object with a string `stack`
 * (an error from another realm, or a copy of a page's error).
 */
export const isError = (value: unknown): value is object =>
  value instanceof Error ||
  (typeof value === "object" &&
    value !== null &&
    "stack" in value &&
    typeof value.stack === "string");

/** Whether `error` is an AggregateError (from this realm or another: its name and its errors). */
export const isAggregate = (error: unknown): error is AggregateError =>
  error instanceof AggregateError ||
  (typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AggregateError" &&
    "errors" in error &&
    Array.isArray(error.errors));
