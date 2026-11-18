import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { optionsFile, optionsOf } from "../optionsFile.ts";

let dirs: string[] = [];
/** A Storybook config folder with `files` (name to content). */
const configDir = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "options-file-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
};
afterEach(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirs = [];
});

describe("the Storybook options file", () => {
  test("is `cucumber.ts`, its default export loaded as Node runs it (its types stripped)", async () => {
    const dir = configDir({
      "cucumber.ts": `const options: { import: string[] } = { import: ["features/**/*.ts"] };\nexport default options;\n`,
    });
    expect(optionsFile(dir)).toBe(path.join(dir, "cucumber.ts"));
    expect(await optionsOf(dir)).toEqual({ import: ["features/**/*.ts"] });
  });

  test("may have another extension Node loads", async () => {
    const dir = configDir({
      "cucumber.mjs": `export default { strict: false };\n`,
    });
    expect(await optionsOf(dir)).toEqual({ strict: false });
  });

  test("missing, is an error naming the file to add", () => {
    const dir = configDir({ "main.ts": "export default {};\n" });
    expect(() => optionsFile(dir)).toThrow(
      /no cucumber options for Storybook, add them .*\n.*cucumber\.ts$/,
    );
  });
});
