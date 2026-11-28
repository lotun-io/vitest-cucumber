// A unit test file's own provided values (`vitestCucumber`, which the unit project provides as a
// node-mode run would: `./provide.ts`): set before each of its tests, the file's own restored after.
// `inject` gives the worker's copy of the provided object, and each test file runs in a worker of
// its own (`isolate`), so a change stays in its file. For what a module reads as it's called; one
// reading it as it loads has the project's values.
import { afterEach, beforeEach, inject, type ProvidedContext } from "vitest";
import type {} from "../types/providedContext.ts";

/** Sets `values` on the provided `vitestCucumber` around each test of the calling file. */
export const withProvided = (
  values: Partial<ProvidedContext["vitestCucumber"]>,
) => {
  let saved: ProvidedContext["vitestCucumber"] | undefined;
  beforeEach(() => {
    const provided = inject("vitestCucumber");
    saved = { ...provided };
    Object.assign(provided, values);
  });
  afterEach(() => {
    if (saved) {
      Object.assign(inject("vitestCucumber"), saved);
    }
  });
};
