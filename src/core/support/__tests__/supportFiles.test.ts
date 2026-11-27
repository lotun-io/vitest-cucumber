import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { configurationOf, type Configuration } from "../../plugin/options.ts";
import { supportFilesOf } from "../supportFiles.ts";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "support-files-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes empty files at `names` (relative to the project). */
const files = (...names: string[]) => {
  for (const name of names) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), "");
  }
};

/** A configuration with these `import` globs. */
const importing = (...globs: string[]) => configurationOf({ import: globs });

/** The support files found, relative to the project, with `/`. */
const supportFiles = async (configuration: Configuration) =>
  (await supportFilesOf(root, configuration)).map((file) =>
    path.relative(root, file).split(path.sep).join("/"),
  );

test("a glob: the files it matches, sorted", async () => {
  files("steps/b.ts", "steps/a.ts", "steps/readme.md");
  expect(await supportFiles(importing("steps/*.ts"))).toEqual([
    "steps/a.ts",
    "steps/b.ts",
  ]);
});

test("a folder: its support files, any depth, by extension", async () => {
  files(
    "support/world.ts",
    "support/nested/hooks.mjs",
    "support/data.json",
    "support/notes.md",
  );
  expect(await supportFiles(importing("support"))).toEqual([
    "support/nested/hooks.mjs",
    "support/world.ts",
  ]);
});

test("several globs: in their order (the definitions' order), each file once", async () => {
  files("steps/a.ts", "steps/b.ts", "support/world.ts");
  expect(
    await supportFiles(importing("support/*.ts", "steps/b.ts", "steps/*.ts")),
  ).toEqual(["support/world.ts", "steps/b.ts", "steps/a.ts"]);
});

test("none given: none, whatever the project has (no default, unlike cucumber)", async () => {
  files(
    "features/steps.ts",
    "features/a.feature",
    "src/Page.tsx",
    "src/Page.stories.ts",
    "src/Page.feature",
  );
  expect(await supportFiles(importing())).toEqual([]);
});

test("a folder with glob characters: matched as it's written, escaped (a bracket class anywhere; a `\\` but on Windows, a separator there)", async () => {
  files("app/[id]/steps.ts", "app/i/steps.ts");
  expect(await supportFiles(importing("app/[[]id[]]"))).toEqual([
    "app/[id]/steps.ts",
  ]);
  if (process.platform !== "win32") {
    expect(await supportFiles(importing("app/\\[id\\]"))).toEqual([
      "app/[id]/steps.ts",
    ]);
  }
});
