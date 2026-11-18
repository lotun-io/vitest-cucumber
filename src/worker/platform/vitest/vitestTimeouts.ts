// Cucumber's default timeouts in a Vitest host (node mode, browser mode, story tests): the project's
// Vitest `testTimeout` (a scenario's steps and hooks) and `hookTimeout` (BeforeAll, AfterAll), as main
// resolved them (Vitest's 0, none, cucumber's -1), unless a definition has its own `timeout`
// (`setDefaultTimeout` isn't supported). Not Storybook's preview: no Vitest, no timeouts
// (`../../storybook/preview/platform.ts`). Page-safe.
import { inject } from "vitest";
import type {} from "../../../types/providedContext.ts";

/** Vitest's `0` (no timeout) as cucumber's `-1`. */
const cucumberTimeout = (timeout: number) => (timeout > 0 ? timeout : -1);

export const vitestTimeouts = () => {
  const { testTimeout, hookTimeout } = inject("vitestCucumber");
  return {
    test: cucumberTimeout(testTimeout),
    hook: cucumberTimeout(hookTimeout),
  };
};
