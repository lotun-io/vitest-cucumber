import { expect, test } from "vitest";
import { scenarioTestOptions } from "../scenarioTestOptions.ts";

// The unit project provides `@slow` as a tag defined with a timeout (`src/__tests__/provide.ts`).
test("a scenario without a timed tag: its tags, cucumber's timeouts only, never concurrent", () => {
  expect(scenarioTestOptions(["@smoke"])).toEqual({
    tags: ["@smoke"],
    timeout: 0,
    concurrent: false,
  });
  expect(scenarioTestOptions([])).toEqual({
    tags: [],
    timeout: 0,
    concurrent: false,
  });
});

test("a scenario with a timed tag: Vitest's, from its tags", () => {
  expect(scenarioTestOptions(["@feature", "@slow"])).toEqual({
    tags: ["@feature", "@slow"],
    concurrent: false,
  });
});

test("given options: kept, their tags first and merged (each once), a given timed tag counted", () => {
  expect(
    scenarioTestOptions(["@smoke", "@a"], { tags: ["@a", "@slow"], retry: 1 }),
  ).toEqual({ tags: ["@a", "@slow", "@smoke"], retry: 1, concurrent: false });
  expect(
    scenarioTestOptions(["@smoke"], {
      tags: "@a",
      timeout: 5,
      concurrent: true,
    }),
  ).toEqual({ tags: ["@a", "@smoke"], timeout: 0, concurrent: false });
});
