import { expect, test } from "vitest";
import { createPlugin } from "../createPlugin.ts";

test("a wrong option: the plugin's error as the plugin is made", () => {
  expect(() =>
    createPlugin({ language: "klingon" }, { platform: "platform.ts" }),
  ).toThrow(
    '@lotun/vitest-cucumber: the "language" option "klingon" isn\'t a Gherkin language',
  );
});

test("a feature file outside Vitest (Storybook's builder runs a Vite config's root plugins too): not transformed", async () => {
  const plugin = createPlugin({}, { platform: "platform.ts" });
  expect(await plugin.transform("", "/project/Login.feature")).toBeUndefined();
  expect(await plugin.transform("", "/project/Login.ts")).toBeUndefined();
});
