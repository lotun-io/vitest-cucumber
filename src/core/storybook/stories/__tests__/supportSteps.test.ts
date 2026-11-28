import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { storybookStepsOfFiles } from "../supportSteps.ts";

const root = mkdtempSync(path.join(tmpdir(), "support-steps-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test("one support file, two hosts of other roots in one process: each its places from its own root", async () => {
  const file = path.join(root, "app/steps/stories.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `Given("the {storybook:story} story with {color}", () => {});\n`,
  );
  const atOf = async (from: string) =>
    (await storybookStepsOfFiles([file], from)).errors.map(({ at }) => at);
  expect(await atOf(path.join(root, "app"))).toEqual([[`steps/stories.ts:1`]]);
  expect(await atOf(root)).toEqual([[`app/steps/stories.ts:1`]]);
});

test("a support file that can't be read: the plugin's error, Node's reason, its place from the root", async () => {
  await expect(
    storybookStepsOfFiles([path.join(root, "app/steps/gone.ts")], root),
  ).rejects.toMatchObject({
    message:
      "[@lotun/vitest-cucumber] the support file can't be read (ENOENT: no such file or directory)\n  app/steps/gone.ts",
    stack: "",
  });
});
