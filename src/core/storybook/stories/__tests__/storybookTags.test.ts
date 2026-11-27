import { combineTags } from "storybook/internal/csf";
import { expect, test } from "vitest";
import { tagOf } from "../../../feature/tagTransform.ts";
import {
  declaredTagsOf,
  storybookTagsOf,
  testTagsOf,
} from "../storybookTags.ts";

test("Storybook's built-in tags: its own constants (`Tag`, `storybook/preview-api`)", async () => {
  expect(await storybookTagsOf()).toMatchObject({
    DEV: "dev",
    TEST: "test",
    AUTODOCS: "autodocs",
    MANIFEST: "manifest",
    PLAY_FN: "play-fn",
  });
});

test("a test's tags: its Gherkin tags but Storybook's, the built-in ones and the ones the scenario takes off, taken off or not; `@dev` as written is a plain tag", async () => {
  const builtIns = await storybookTagsOf();
  const tags = [
    "@smoke",
    "@tag(dev)",
    "@tag(!dev)",
    "@tag(!test)",
    "@tag(autodocs)",
    "@tag(slow)",
    "@tag(!smoke)",
    "@dev",
  ].map(tagOf);
  expect(testTagsOf(tags, builtIns)).toEqual(["@smoke", "slow", "@dev"]);
  // A tag the scenario takes off: neither it nor its `!` form, whichever comes first (put back
  // after, it's the story's alone); another tag stays.
  const of = (...gherkin: string[]) => testTagsOf(gherkin.map(tagOf), builtIns);
  expect(of("@tag(smoke)", "@tag(!smoke)", "@tag(fast)")).toEqual(["fast"]);
  expect(of("@tag(!smoke)", "@tag(smoke)")).toEqual([]);
  expect(of("@tag(!smoke)")).toEqual([]);
  // `@smoke` is another tag than `smoke`: a plain Gherkin tag isn't taken off by `@tag(!smoke)`.
  expect(of("@smoke", "@tag(!smoke)")).toEqual(["@smoke"]);
});

test("a project's declared tags: every tag a test may have, so without the `!` forms and the built-in ones; one a scenario takes off still declared (another may have it)", async () => {
  const builtIns = await storybookTagsOf();
  const tags = ["@smoke", "smoke", "!smoke", "dev", "!dev", "slow"];
  expect(declaredTagsOf(tags, builtIns)).toEqual(["@smoke", "smoke", "slow"]);
});

test("as Storybook combines a story's tags: a scenario's own `@tag(…)` after its feature's wins, either way", () => {
  // A story's tags as Storybook has them: every story's `dev` and `test`, then the scenario's.
  const combined = (...gherkin: string[]) =>
    combineTags("dev", "test", ...gherkin.map(tagOf));
  expect(combined("@tag(!dev)")).toEqual(["test"]);
  expect(combined("@tag(!test)")).toEqual(["dev"]);
  // A feature's `@tag(!dev)`, then one scenario's `@tag(dev)` (a pickle's tags: outer first).
  expect(combined("@tag(!dev)", "@tag(dev)")).toEqual(["test", "dev"]);
  expect(combined("@tag(dev)", "@tag(!dev)")).toEqual(["test"]);
  // The old special names are plain tags now: no effect on Storybook's own.
  expect(combined("@!dev")).toEqual(["dev", "test", "@!dev"]);
});
