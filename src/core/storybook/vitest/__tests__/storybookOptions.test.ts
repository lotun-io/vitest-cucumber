import { expect, test } from "vitest";
import type { PresetOptions } from "../../preset/project.ts";
import {
  storybookOptionsOf,
  storybookOptionsPlugin,
} from "../storybookOptions.ts";

const options = {
  configDir: "/p/.storybook",
  presets: { apply: () => Promise.resolve([]) },
} as unknown as PresetOptions;

test("the preset's plugin carries Storybook's options to the Vitest plugin, which finds it among its project's plugins", () => {
  expect(
    storybookOptionsOf([{ name: "another" }, storybookOptionsPlugin(options)]),
  ).toBe(options);
});

test("the preset not loaded (no such plugin): the plugin's error, with what to add", () => {
  expect(() => storybookOptionsOf([{ name: "another" }])).toThrow(
    `@lotun/vitest-cucumber: Storybook's preset of the plugin isn't loaded: add "@lotun/vitest-cucumber/storybook" to the "addons" of .storybook/main.ts`,
  );
});
