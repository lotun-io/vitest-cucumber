import { expect, test } from "vitest";
import { staleFeaturesOf } from "../staleFeatures.ts";
import { createStoriesLinks } from "../storiesLinks.ts";

/** The stories links: a feature on the stories file next to it, one on a named one, one with none. */
const links = createStoriesLinks();
links.link("/p/src/Button.feature", "/p/src/Button.stories.tsx");
links.link("/p/features/Session.feature", "/p/src/Header.stories.ts");
links.link("/p/src/Header.feature", "/p/src/Header.stories.ts");
links.link("/p/src/Card.feature");

const touched = (
  type: "add" | "change" | "unlink",
  file: string,
  stepsChanged = false,
) => staleFeaturesOf({ type, file, links, stepsChanged });

test("a stories file changed: the features that run on it", () => {
  expect(touched("change", "/p/src/Header.stories.ts")).toEqual([
    "/p/features/Session.feature",
    "/p/src/Header.feature",
  ]);
  expect(touched("change", "/p/src/Card.stories.ts")).toEqual([]);
});

test("a stories file deleted: the features that run on it", () => {
  expect(touched("unlink", "/p/src/Button.stories.tsx")).toEqual([
    "/p/src/Button.feature",
  ]);
});

test("a stories file added: the feature next to it by its name, and the ones with none (a step of theirs may name it)", () => {
  expect(touched("add", "/p/src/Card.stories.ts")).toEqual([
    "/p/src/Card.feature",
  ]);
  // Another extension next to a feature that runs on one: its sibling too.
  expect(touched("add", "/p/src/Button.stories.ts")).toEqual([
    "/p/src/Button.feature",
    "/p/src/Card.feature",
  ]);
  expect(touched("add", "/p/other/New.stories.ts")).toEqual([
    "/p/src/Card.feature",
  ]);
});

test("any other file, whatever its event: none", () => {
  for (const type of ["add", "change", "unlink"] as const) {
    expect(touched(type, "/p/src/Button.tsx")).toEqual([]);
    expect(touched(type, "/p/steps/steps.ts")).toEqual([]);
  }
});

test("the Storybook steps' expressions are others: every Storybook feature", () => {
  expect(touched("change", "/p/steps/stories.ts", true)).toEqual(
    links.features(),
  );
});
