// The plugin's options file, `cucumber.config.ts` (or another of `optionsFileExtensions`, the
// first found): in a project's root, or a Storybook project's config folder
// (`../storybook/storybookOptionsFile.ts`). A module is imported as Node imports it (its own
// TypeScript support: erasable syntax, imports with their extension), so no loader is needed, in
// Vitest's process or Storybook's; a JSON file is parsed. Vitest's own config lookup has the same
// names and order (`vitest.config.*`), JSON added.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CucumberOptions } from "../../types/feature.ts";
import { pluginError } from "../../utils/errors.ts";
import { slash } from "../../utils/slash.ts";

/** The options file's extensions, in the order they're looked for. */
export const optionsFileExtensions = [
  ".ts",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
];

/** The options file's name without its extension. */
const optionsFileName = "cucumber.config";

/** `file`'s path from the working directory, with `/`, as the plugin's errors name a file. */
export const fromWorkingDirectory = (file: string) =>
  slash(path.relative(process.cwd(), file));

/** `folder`'s options file, if it has one: the first of `optionsFileExtensions`. */
export const optionsFileIn = (folder: string) =>
  optionsFileExtensions
    .map((extension) => path.join(folder, `${optionsFileName}${extension}`))
    .find((file) => existsSync(file));

/** Whether `file` is named as an options file, wherever it is. */
export const isOptionsFileName = (file: string) =>
  optionsFileExtensions.some(
    (extension) => path.basename(file) === `${optionsFileName}${extension}`,
  );

/** Whether `value` is an object of options: a plain object (not an array, not a class's). */
const isOptions = (value: unknown): value is CucumberOptions =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value) as object);

/** A JSON file's options, its content (`text`). */
const jsonOptions = (file: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw pluginError(
      `the options file ${fromWorkingDirectory(file)} can't be loaded`,
      { cause: error, quiet: true },
    );
  }
};

/**
 * A module's options, its default export. `version` (its text's hash) is in its URL: Node keeps a
 * module by its URL, so the same text is the module Node already has, and a changed file is
 * imported again (the modules it imports aren't: Node's, as first loaded).
 */
const moduleOptions = async (
  file: string,
  version: string,
): Promise<unknown> => {
  const url = pathToFileURL(file);
  url.searchParams.set("version", version);
  try {
    const { default: options } = (await import(
      // The project's file: never Vite's to resolve (main's code, a page never loads it).
      /* @vite-ignore */
      url.href
    )) as { default?: unknown };
    return options;
  } catch (error) {
    throw pluginError(
      `the options file ${fromWorkingDirectory(file)} can't be loaded`,
      { cause: error, quiet: true },
    );
  }
};

/**
 * The options in `file`, as it is on disk: a JSON file's content, a module's default export. An
 * error if they aren't an object of options.
 */
export const optionsIn = async (file: string): Promise<CucumberOptions> => {
  const text = await readFile(file, "utf8");
  const options =
    path.extname(file) === ".json"
      ? jsonOptions(file, text)
      : await moduleOptions(
          file,
          createHash("sha256").update(text).digest("hex").slice(0, 16),
        );
  if (!isOptions(options)) {
    throw pluginError(
      `the options file ${fromWorkingDirectory(file)} must have its options as its default export (an object)`,
      { quiet: true },
    );
  }
  return options;
};
