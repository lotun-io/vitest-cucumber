import path from "node:path";
import { expect, test } from "vitest";
import type { PresetOptions } from "../../preset/project.ts";
import { autoTitleOfStorybook, createAutoTitleOf } from "../storiesTitle.ts";

const project = path.join(process.cwd(), "a-project");
const file = (name: string) => path.join(project, name);

test("Storybook's automatic title of a stories file: its path from the folder of the `stories` pattern that matches it, as Storybook cleans it; no pattern matches it: none", async () => {
  const asked = { stories: 0 };
  // The preset's: Storybook's `stories`, written from its config folder.
  const autoTitleOf = createAutoTitleOf(() => {
    asked.stories += 1;
    return Promise.resolve({
      from: path.join(project, ".storybook"),
      entries: [
        "../src/**/*.stories.@(ts|tsx)",
        "../@(src|features)/**/*.feature",
      ],
    });
  });
  expect(await autoTitleOf(file("src/stories/Auto.stories.ts"))).toBe(
    "stories/Auto",
  );
  // Named as its folder, or `index`: the folder's name.
  expect(await autoTitleOf(file("src/parts/Card/Card.stories.tsx"))).toBe(
    "parts/Card",
  );
  expect(await autoTitleOf(file("src/parts/Card/index.stories.ts"))).toBe(
    "parts/Card",
  );
  expect(await autoTitleOf(file("lib/Unlisted.stories.ts"))).toBeUndefined();
  // Storybook's `stories` are read once.
  expect(asked.stories).toBe(1);
});

test("from Storybook's options, as both hosts have them: its `stories` (its presets'), written from its config folder, asked at the first title", async () => {
  const asked: string[] = [];
  const options = {
    configDir: path.join(project, ".storybook"),
    presets: {
      apply: (name: string) => {
        asked.push(name);
        return Promise.resolve(["../src/**/*.stories.@(ts|tsx)"]);
      },
    },
  } as unknown as PresetOptions;
  const autoTitleOf = autoTitleOfStorybook(options);
  expect(asked).toEqual([]);
  expect(await autoTitleOf(file("src/stories/Auto.stories.ts"))).toBe(
    "stories/Auto",
  );
  expect(await autoTitleOf(file("lib/Unlisted.stories.ts"))).toBeUndefined();
  expect(asked).toEqual(["stories"]);
});

test("without the pattern's `titlePrefix`: Storybook adds the feature file's own to the title its stories module writes", async () => {
  const autoTitleOf = createAutoTitleOf(() =>
    Promise.resolve({
      from: path.join(project, ".storybook"),
      entries: [
        { directory: "../src", files: "**/*.stories.ts", titlePrefix: "App" },
      ],
    }),
  );
  expect(await autoTitleOf(file("src/stories/Auto.stories.ts"))).toBe(
    "stories/Auto",
  );
});
