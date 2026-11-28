import { expect, test } from "vitest";
import { withProvided } from "../../../../__tests__/withProvided.ts";
import { vitestTimeouts } from "../vitestTimeouts.ts";

// A project with no test timeout (Vitest's 0), and Vitest's default hook timeout.
withProvided({ testTimeout: 0, hookTimeout: 10_000 });

test("Vitest's timeouts as cucumber's: its 0 (none) cucumber's -1", () => {
  expect(vitestTimeouts()).toEqual({ test: -1, hook: 10_000 });
});
