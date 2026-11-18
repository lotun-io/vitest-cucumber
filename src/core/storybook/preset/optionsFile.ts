// Storybook: the preset's cucumber options, `<configDir>/cucumber.ts`'s default export (the object
// the project's Vitest config passes to `cucumber()` too). Found and imported as Node does: a
// TypeScript file with its types stripped (Node 24), so no loader of Storybook's (its internals) is
// needed.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CucumberOptions } from "../../../types/feature.ts";
import { pluginError } from "../../../utils/errors.ts";

/** The extensions the options file may have: Node imports each as it is. */
const extensions = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

/**
 * The options file, `<configDir>/cucumber.ts` (or another of `extensions`): an error without it,
 * naming the file to add.
 */
export const optionsFile = (configDir: string) => {
  const base = path.join(configDir, "cucumber");
  const file = extensions
    .map((extension) => `${base}${extension}`)
    .find((candidate) => existsSync(candidate));
  if (!file) {
    throw pluginError(
      `no cucumber options for Storybook, add them (the options your Vitest config passes to \`cucumber()\`, as its default export):\n${path.relative(process.cwd(), base)}.ts`,
      { quiet: true },
    );
  }
  return file;
};

/** The cucumber options in the options file (`optionsFile`), its default export. */
export const optionsOf = async (
  configDir: string,
): Promise<CucumberOptions> => {
  const { default: options } = (await import(
    // The project's file: never Vite's to resolve (main's code, a page never loads it).
    /* @vite-ignore */
    pathToFileURL(optionsFile(configDir)).href
  )) as { default: CucumberOptions };
  return options;
};
