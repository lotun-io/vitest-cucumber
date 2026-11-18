// What a host throws for a run's failures (`Host["throwable"]`), one of them as it is, several in one
// AggregateError (`<what>: N errors`). A Vitest host (node mode's worker, a page): copies as Vitest
// serializes them (`./serializedErrors.ts`'s `vitestThrown`, its own module: Storybook's preview never
// loads Vitest's serialization); Vitest spreads the AggregateError, so each is its own error. Storybook's
// preview: the originals (Storybook shows the thrown error itself; the failing step is its own entry
// in its panel). Page-safe.
import type { Failure } from "../../../types/platform.ts";

/** One error as it is, several in one AggregateError. */
export const oneOrAll = (errors: readonly unknown[], what: string) =>
  errors.length === 1
    ? errors[0]
    : new AggregateError(errors, `${what}: ${String(errors.length)} errors`);

/** Storybook's preview's `throwable`: the originals. */
export const originalThrown = (failures: readonly Failure[], what: string) =>
  oneOrAll(
    failures.map(({ value }) => value),
    what,
  );
