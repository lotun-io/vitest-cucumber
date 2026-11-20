import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { PresetOptions } from "../../storybook/preset/project.ts";
import { storybookOptionsPlugin } from "../../storybook/vitest/storybookOptions.ts";
import { configurationOfProject, optionsSourceOf } from "../projectOptions.ts";

let roots: string[] = [];
/** A project's root with `files` (path from it to content), and a function writing more. */
const projectWith = (files: Record<string, string>) => {
  const root = mkdtempSync(path.join(tmpdir(), "project-options-"));
  roots.push(root);
  const write = (name: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  for (const [name, content] of Object.entries(files)) {
    write(name, content);
  }
  return { root, write };
};
afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots = [];
});

/** A Storybook project's plugins: the addon's, and the preset's that carries Storybook's options. */
const storybookPlugins = (root: string) => [
  { name: "vite-plugin-storybook-test" },
  storybookOptionsPlugin({
    configDir: path.join(root, ".storybook"),
  } as PresetOptions),
];

describe("where a project's options are", () => {
  test("given to cucumber(): those, no file read", () => {
    const { root } = projectWith({
      "cucumber.config.json": '{ "strict": false }',
    });
    expect(optionsSourceOf({ dryRun: true }, { root, plugins: [] })).toEqual({
      options: { dryRun: true },
    });
  });

  test("none given: the root's options file, else none (the defaults)", () => {
    const { root } = projectWith({ "cucumber.config.json": "{}" });
    expect(optionsSourceOf(undefined, { root, plugins: [] })).toEqual({
      file: path.join(root, "cucumber.config.json"),
    });
    expect(
      optionsSourceOf(undefined, { root: projectWith({}).root, plugins: [] }),
    ).toEqual({ options: {} });
  });

  test("a Storybook project: its config folder's file only, not the root's", () => {
    const { root } = projectWith({
      "cucumber.config.json": "{}",
      ".storybook/cucumber.config.json": "{}",
    });
    expect(
      optionsSourceOf(undefined, { root, plugins: storybookPlugins(root) }),
    ).toEqual({ file: path.join(root, ".storybook", "cucumber.config.json") });
  });

  test("a Storybook project given options: its file all the same, they aren't used", () => {
    const { root } = projectWith({ ".storybook/cucumber.config.json": "{}" });
    expect(
      optionsSourceOf(
        { strict: false },
        { root, plugins: storybookPlugins(root) },
      ),
    ).toEqual({ file: path.join(root, ".storybook", "cucumber.config.json") });
  });

  test("a Storybook project without its file: the error naming the file to add", () => {
    const { root } = projectWith({});
    expect(() =>
      optionsSourceOf(undefined, { root, plugins: storybookPlugins(root) }),
    ).toThrow(/\.storybook\/cucumber\.config\.ts is missing$/);
  });
});

describe("a project's configuration", () => {
  test("its options with cucumber's defaults: given, or its file's", async () => {
    const { root } = projectWith({
      "cucumber.config.json": '{ "import": ["steps/*.ts"], "backtrace": true }',
    });
    expect(
      await configurationOfProject(undefined, { root, plugins: [] }),
    ).toMatchObject({ import: ["steps/*.ts"], backtrace: true, strict: true });
    expect(
      await configurationOfProject({ strict: false }, { root, plugins: [] }),
    ).toMatchObject({ import: [], backtrace: false, strict: false });
  });

  test("read as the file is now: a changed module imported again", async () => {
    const { root, write } = projectWith({
      "cucumber.config.mjs": "export default { dryRun: true };\n",
    });
    const project = { root, plugins: [] };
    expect(await configurationOfProject(undefined, project)).toMatchObject({
      dryRun: true,
    });
    write("cucumber.config.mjs", "export default { dryRun: false };\n");
    expect(await configurationOfProject(undefined, project)).toMatchObject({
      dryRun: false,
    });
  });

  test("a file that can't be used: its error", async () => {
    const { root } = projectWith({ "cucumber.config.json": "{" });
    await expect(
      configurationOfProject(undefined, { root, plugins: [] }),
    ).rejects.toThrow(/cucumber\.config\.json can't be loaded$/);
  });
});
