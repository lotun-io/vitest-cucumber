import { expect, test } from "vitest";
import { cucumber } from "../node.ts";
import { cucumberOptionsOf, type PresetOptions } from "../preset/project.ts";

test("`cucumber()` from `/storybook/node`, the addon entry: the plugin's preset, its options under the plugin's own key", () => {
  expect(cucumber({ import: ["steps/*.ts"] })).toEqual({
    name: "@lotun/vitest-cucumber/storybook",
    options: { vitestCucumber: { import: ["steps/*.ts"] } },
  });
});

test("the preset's functions get the entry's options among Storybook's: the plugin's options read from them", () => {
  const storybook = {
    configDir: ".storybook",
    presets: {},
  } as unknown as PresetOptions;
  const { options } = cucumber({ import: ["steps/*.ts"], language: "fr" });
  expect(cucumberOptionsOf({ ...storybook, ...options })).toEqual({
    import: ["steps/*.ts"],
    language: "fr",
  });
  // The preset listed by its name (no options): none, which the plugin refuses (no `import`).
  expect(cucumberOptionsOf(storybook)).toEqual({});
});
