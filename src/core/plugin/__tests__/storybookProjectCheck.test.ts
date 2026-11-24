import { expect, test } from "vitest";
import { checkNotInStorybookProject } from "../storybookProjectCheck.ts";

test("a project without Storybook's addon: cucumber() belongs there", () => {
  expect(() => {
    checkNotInStorybookProject([{ name: "vite:react-babel" }]);
  }).not.toThrow();
});

test("a Storybook project: cucumber() there is refused, with or without the addon entry's plugins", () => {
  const addon = { name: "vite-plugin-storybook-test" };
  for (const plugins of [
    [addon],
    [addon, { name: "vitest-cucumber:storybook" }],
  ]) {
    expect(() => {
      checkNotInStorybookProject(plugins);
    }).toThrow(
      "[@lotun/vitest-cucumber] remove cucumber() from this Storybook project, use the addon in .storybook/main.ts",
    );
  }
});
