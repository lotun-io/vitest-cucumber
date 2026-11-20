import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  isOptionsFileName,
  optionsFileExtensions,
  optionsFileIn,
  optionsIn,
} from "../optionsFile.ts";

let folders: string[] = [];
/** A folder with `files` (name to content). */
const folderWith = (files: Record<string, string>) => {
  const folder = mkdtempSync(path.join(tmpdir(), "options-file-"));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(folder, name), content);
  }
  return folder;
};
afterEach(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
  folders = [];
});

/** The options in `folder`'s options file, read as the plugin reads it. */
const optionsOf = async (folder: string) => {
  const file = optionsFileIn(folder);
  if (!file) {
    throw new Error(`no options file in ${folder}`);
  }
  return optionsIn(file);
};

describe("the options file", () => {
  test("is `cucumber.config` with each extension: a module's default export, a JSON file's content", async () => {
    const content: Record<string, string> = {
      ".ts": `const options: { strict: boolean } = { strict: false };\nexport default options;\n`,
      ".mts": "export default { strict: false };\n",
      ".cts": "module.exports = { strict: false };\n",
      ".js": "export default { strict: false };\n",
      ".mjs": "export default { strict: false };\n",
      ".cjs": "module.exports = { strict: false };\n",
      ".json": '{ "strict": false }\n',
    };
    for (const extension of optionsFileExtensions) {
      const folder = folderWith({
        // A module file in a folder of its own needs its module type for `.js` and `.ts`.
        "package.json": '{ "type": "module" }',
        [`cucumber.config${extension}`]: content[extension] ?? "",
      });
      expect(await optionsOf(folder), extension).toEqual({ strict: false });
    }
  });

  test("the first extension found, in Vitest's order (`.ts` first), JSON last", () => {
    const folder = folderWith({
      "cucumber.config.json": "{}",
      "cucumber.config.mjs": "export default {};\n",
      "cucumber.config.ts": "export default {};\n",
    });
    expect(optionsFileIn(folder)).toBe(path.join(folder, "cucumber.config.ts"));
    expect(optionsFileIn(folderWith({}))).toBeUndefined();
  });

  test("its name, wherever it is", () => {
    expect(isOptionsFileName("/p/cucumber.config.ts")).toBe(true);
    expect(isOptionsFileName("/p/.storybook/cucumber.config.json")).toBe(true);
    expect(isOptionsFileName("/p/cucumber.ts")).toBe(false);
    expect(isOptionsFileName("/p/cucumber.config.yaml")).toBe(false);
  });

  test("a module changed: imported again, its new options; unchanged, the same module", async () => {
    const folder = folderWith({
      "cucumber.config.mjs":
        "export default { strict: false, worldParameters: {} };\n",
    });
    const first = await optionsOf(folder);
    expect(first).toEqual({ strict: false, worldParameters: {} });
    // The same text: the module Node already has (nothing imported again).
    expect(await optionsOf(folder)).toBe(first);
    writeFileSync(
      path.join(folder, "cucumber.config.mjs"),
      "export default { strict: true };\n",
    );
    expect(await optionsOf(folder)).toEqual({ strict: true });
  });

  test("not an object of options: the plugin's error", async () => {
    for (const [name, content] of [
      ["cucumber.config.mjs", "export const strict = false;\n"],
      ["cucumber.config.mjs", "export default [];\n"],
      ["cucumber.config.json", '"strict"'],
    ] as const) {
      await expect(optionsOf(folderWith({ [name]: content }))).rejects.toThrow(
        /the options file .*cucumber\.config\.\w+ must have its options as its default export \(an object\)$/,
      );
    }
  });

  test("a file that can't be read as options: the plugin's error, the reason its cause", async () => {
    await expect(
      optionsOf(folderWith({ "cucumber.config.json": "{ strict: false }" })),
    ).rejects.toMatchObject({
      message: expect.stringMatching(
        /the options file .*cucumber\.config\.json can't be loaded$/,
      ) as unknown,
      cause: expect.any(SyntaxError) as unknown,
    });
    await expect(
      optionsOf(
        folderWith({
          "cucumber.config.mjs": 'throw new Error("not ready");\n',
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(
        /the options file .*cucumber\.config\.mjs can't be loaded$/,
      ) as unknown,
      cause: expect.objectContaining({ message: "not ready" }) as unknown,
    });
  });
});
