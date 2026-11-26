import { combineTags } from "storybook/internal/csf";
import { expect, test } from "vitest";
import { storyTagsOf, testTagsOf } from "../storybookTags.ts";

test("Storybook's own tags, written as Gherkin tags: its story's without the `@`, in order; any other tag as it's written", () => {
  expect(
    storyTagsOf(["@smoke", "@!dev", "@test", "@dev", "@!test", "@development"]),
  ).toEqual(["@smoke", "!dev", "test", "dev", "!test", "@development"]);
});

test("they aren't its Vitest test's tags", () => {
  expect(
    testTagsOf(["@smoke", "@!dev", "@test", "@dev", "@!test", "@development"]),
  ).toEqual(["@smoke", "@development"]);
});

test("as Storybook combines them: a scenario's own tag after its feature's wins, either way", () => {
  // A story's tags as Storybook has them: every story's `dev` and `test`, then the scenario's.
  const combined = (...gherkin: string[]) =>
    combineTags("dev", "test", ...storyTagsOf(gherkin));
  expect(combined("@!dev")).toEqual(["test"]);
  expect(combined("@!test")).toEqual(["dev"]);
  // A feature's `@!dev`, then one scenario's `@dev` (a pickle's tags: outer first).
  expect(combined("@!dev", "@dev")).toEqual(["test", "dev"]);
  expect(combined("@dev", "@!dev")).toEqual(["test"]);
});
