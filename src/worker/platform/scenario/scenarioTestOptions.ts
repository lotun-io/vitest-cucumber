// A scenario's test's options, a feature file's (`../../feature/runtime.ts`) and a story test's
// (`../../storybook/vitest/cucumberTests.ts`) alike: its Gherkin tags as Vitest tags, after any it's given (the
// addon's, if it ever gives some); cucumber's own timeouts (`timeout: 0`: Vitest's `testTimeout`
// doesn't apply), unless one of its tags' Vitest definitions sets a `timeout`: then Vitest's, from
// its tags (the lowest `priority` first, else the last of the test's tags, a pickle's innermost);
// never concurrent (the support code's module state is shared by every run in the worker or page).
// Page-safe.
import { inject, type TestOptions } from "vitest";
import type {} from "../../../types/providedContext.ts";

/** The timeout option of a scenario's test with `tags`. */
const scenarioTimeout = (tags: string[]): { timeout?: number } => {
  const { timedTags } = inject("vitestCucumber");
  return tags.some((tag) => timedTags.includes(tag)) ? {} : { timeout: 0 };
};

/** The options of a scenario's test with `gherkinTags`, `given`'s kept (its tags merged). */
export const scenarioTestOptions = (
  gherkinTags: string[],
  given: TestOptions = {},
): TestOptions => {
  const tags = [...new Set([given.tags ?? []].flat().concat(gherkinTags))];
  return { ...given, tags, ...scenarioTimeout(tags), concurrent: false };
};
