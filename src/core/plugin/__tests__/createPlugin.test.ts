import { expect, test } from "vitest";
import { createPlugin } from "../createPlugin.ts";

test("a wrong option: the plugin's error as the plugin is made", () => {
  expect(() =>
    createPlugin(
      { import: [], language: "klingon" },
      { platform: "platform.ts" },
    ),
  ).toThrow(
    '[@lotun/vitest-cucumber] the "language" option "klingon" isn\'t a Gherkin language',
  );
  expect(() => createPlugin({}, { platform: "platform.ts" })).toThrow(
    '[@lotun/vitest-cucumber] the "import" option is required',
  );
});

test("a feature file outside Vitest (Storybook's builder runs a Vite config's root plugins too): not transformed", async () => {
  const plugin = createPlugin({ import: [] }, { platform: "platform.ts" });
  expect(await plugin.transform("", "/project/Login.feature")).toBeUndefined();
  expect(await plugin.transform("", "/project/Login.ts")).toBeUndefined();
});
