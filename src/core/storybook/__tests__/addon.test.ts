import { expect, test } from "vitest";
import { cucumber } from "../node.ts";
import { cucumberOptionsOf, type PresetOptions } from "../preset/project.ts";

test("`cucumber()` from `/storybook/node`, the addon entry: the plugin's preset, its options under the plugin's own key", () => {
  expect(cucumber({ import: ["steps/*.ts"] })).toEqual({
    name: "@lotun/vitest-cucumber/storybook",
    options: { vitestCucumber: { import: ["steps/*.ts"] } },
  });
  // None given: cucumber's defaults.
  expect(cucumber()).toEqual({
    name: "@lotun/vitest-cucumber/storybook",
    options: { vitestCucumber: {} },
  });
});

test("the preset's functions get the entry's options among Storybook's: the plugin's options read from them", () => {
  const storybook = {
    configDir: ".storybook",
    presets: {},
  } as unknown as PresetOptions;
  const { options } = cucumber({ language: "fr" });
  expect(cucumberOptionsOf({ ...storybook, ...options })).toEqual({
    language: "fr",
  });
  // The preset listed by its name (no options): cucumber's defaults.
  expect(cucumberOptionsOf(storybook)).toEqual({});
});
