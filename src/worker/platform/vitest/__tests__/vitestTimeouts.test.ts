import { expect, test } from "vitest";
import { vitestTimeouts } from "../vitestTimeouts.ts";

// The unit project provides `testTimeout` 0 and `hookTimeout` 10 000 (`src/__tests__/provide.ts`).
test("Vitest's timeouts as cucumber's: its 0 (none) cucumber's -1", () => {
  expect(vitestTimeouts()).toEqual({ test: -1, hook: 10_000 });
});
