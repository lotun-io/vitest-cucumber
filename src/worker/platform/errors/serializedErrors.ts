// A run's failures as a Vitest host sends them (a test's errors, the stream's text). Vitest's runner
// gives a test's error to `processError`, which builds the diff from its `expected` and `actual`,
// makes them text, and returns its `serializeValue` copy (every property it has or inherits, getters
// read, class instances and built-ins made plain), changing the error it's given. So the host sends
// its own copies, made first (`serializeError`): Vitest changes those, the user's errors never
// touched. Each copy:
// - the host's own change to it (`transform`: a page's BigInts as text, the stream's cycles cut), while
//   it is all the host's data;
// - then an assertion's `expected` and `actual`: the originals, back on each error's copy (the error,
//   its causes, an AggregateError's members), each original walked next to its copy (an error with its
//   own `toJSON`, chai's AssertionError, is copied from what it returns: no map finds its copy), so
//   Vitest's diff is the one it would make (serialized, a `Set` or a `Map` would diff as `{}`);
// - a scenario step's error: its step's line as the first frame of its copy's stack (Vitest's code
//   frame of the Gherkin line);
// - a user's AggregateError: its copy without `errors` (never an AggregateError: a plain copy), then
//   its members' copies, one level, each with the step's line too (Vitest spreads an AggregateError
//   and drops it; a nested one stays as Vitest prints it).
// Page-safe.
import { serializeValue } from "@vitest/utils/serialize";
import type { Failure, StepFrame } from "../../../types/platform.ts";
import { isAggregate, isError } from "./errorKinds.ts";
import { withStepFrame } from "./stacks.ts";
import { oneOrAll } from "./thrown.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Puts each original error's `expected` and `actual` on its copy: `error`, its causes and an
 * AggregateError's errors, each walked next to its copy (`visited`: the copies done; one that isn't an
 * object, e.g. a cycle cut as `[Circular]` or what a `toJSON` returned, ends the walk there).
 */
const restoreDiffValues = (
  error: unknown,
  copy: unknown,
  visited: WeakSet<object>,
) => {
  if (!isError(error) || !isObject(copy) || visited.has(copy)) {
    return;
  }
  visited.add(copy);
  for (const key of ["expected", "actual"]) {
    if (key in error) {
      copy[key] = Reflect.get(error, key);
    }
  }
  restoreDiffValues(Reflect.get(error, "cause"), copy.cause, visited);
  if (isAggregate(error) && Array.isArray(copy.errors)) {
    const members: unknown[] = copy.errors;
    const originals: unknown[] = error.errors;
    originals.forEach((member, index) => {
      restoreDiffValues(member, members[index], visited);
    });
  }
};

/** `error` as Vitest serializes it: `transform` on the copy, then the diff's originals back on it. */
const serializeError = (
  error: unknown,
  transform: (copy: unknown) => unknown = (copy) => copy,
): unknown => {
  const copy = transform(serializeValue(error));
  restoreDiffValues(error, copy, new WeakSet());
  return copy;
};

/** `copy` with `frame` as its stack's first frame (a copy whose stack is text; once per copy). */
const withFrame = (
  copy: unknown,
  frame: StepFrame | undefined,
  framed: WeakSet<object>,
) => {
  if (
    frame &&
    isObject(copy) &&
    !framed.has(copy) &&
    typeof copy.stack === "string"
  ) {
    framed.add(copy);
    copy.stack = withStepFrame(copy.stack, frame);
  }
  return copy;
};

/** `failures` as a Vitest host sends them (see the module comment). */
export const serializedErrors = (
  failures: readonly Failure[],
  transform?: (copy: unknown) => unknown,
): unknown[] => {
  const framed = new WeakSet<object>();
  const errors: unknown[] = [];
  for (const { value, frame } of failures) {
    const copy = serializeError(value, transform);
    if (isAggregate(value) && isObject(copy)) {
      const members: unknown[] = Array.isArray(copy.errors) ? copy.errors : [];
      delete copy.errors;
      errors.push(
        withFrame(copy, frame, framed),
        ...members.map((member) => withFrame(member, frame, framed)),
      );
    } else {
      errors.push(withFrame(copy, frame, framed));
    }
  }
  return errors;
};

/**
 * A Vitest host's `throwable` (`Host["throwable"]`): copies as Vitest serializes them, `transform` the
 * host's own change to each (a page's: `./bigIntsAsText.ts`), several in one AggregateError.
 */
export const vitestThrown =
  (transform?: (copy: unknown) => unknown) =>
  (failures: readonly Failure[], what: string) =>
    oneOrAll(serializedErrors(failures, transform), what);
