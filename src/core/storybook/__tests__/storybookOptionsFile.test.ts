import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { storybookOptionsFile } from "../storybookOptionsFile.ts";

let folders: string[] = [];
/** A Storybook config folder with `files`. */
const configDir = (...files: string[]) => {
  const folder = mkdtempSync(path.join(tmpdir(), "storybook-options-"));
  folders.push(folder);
  for (const name of files) {
    writeFileSync(path.join(folder, name), "export default {};\n");
  }
  return folder;
};
afterEach(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
  folders = [];
});

test("a Storybook project's options file: its config folder's `cucumber.config.*`", () => {
  const folder = configDir("main.ts", "cucumber.config.ts");
  expect(storybookOptionsFile(folder)).toBe(
    path.join(folder, "cucumber.config.ts"),
  );
  const json = configDir("cucumber.config.json");
  expect(storybookOptionsFile(json)).toBe(
    path.join(json, "cucumber.config.json"),
  );
});

test("none: an error naming it", () => {
  expect(() => storybookOptionsFile(configDir("main.ts"))).toThrow(
    /^@lotun\/vitest-cucumber: .*\/cucumber\.config\.ts is missing$/,
  );
});
