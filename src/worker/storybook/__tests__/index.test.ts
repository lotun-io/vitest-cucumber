import { expect, test } from "vitest";
import { story } from "../index.ts";

// In a story, `story()` is the running story's context (the e2e Storybook cases: `e2e/storybook.feature`).
test("outside a story: an error that says so", () => {
  expect(() => story()).toThrow(
    "[@lotun/vitest-cucumber] no story is running, story() works only in a scenario's step or hook",
  );
});
