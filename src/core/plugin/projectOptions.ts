// A Vitest project's cucumber options: the ones given to `cucumber()`, or else its options file's
// (`./optionsFile.ts`: `cucumber.config.*` in the project's root), or else none (the defaults).
// Never both: a file isn't read when options are given (another file is the user's to import).
// A Storybook project (Storybook's addon among its plugins) always has its config folder's file,
// the one Storybook's own process reads (`../storybook/storybookOptionsFile.ts`): options given
// there aren't used (the user's calls, 2026-11-20: a root `cucumber(options)` inherited by every
// project serves its other projects; no warning). Read as a part of the project's plans
// (`../feature/plans.ts`), so each run reads them again, as everything a run reads from disk.
import type { CucumberOptions } from "../../types/feature.ts";
import { storybookOptionsFile } from "../storybook/storybookOptionsFile.ts";
import { hasStorybookPlugin } from "../storybook/vitest/addon.ts";
import { storybookOptionsOf } from "../storybook/vitest/storybookOptions.ts";
import { configurationOf, type Configuration } from "./options.ts";
import { optionsFileIn, optionsIn } from "./optionsFile.ts";

/** A project's resolved config, as `configResolved` gives it: where its options are looked for. */
export interface OptionsProject {
  root: string;
  plugins: readonly { name: string }[];
}

/** Where a project's options are: given (or none, the defaults), or in an options file. */
type OptionsSource = { options: CucumberOptions } | { file: string };

/** Where `project`'s options are, `given` the ones `cucumber()` was given. */
export const optionsSourceOf = (
  given: CucumberOptions | undefined,
  { root, plugins }: OptionsProject,
): OptionsSource => {
  if (hasStorybookPlugin(plugins)) {
    return {
      file: storybookOptionsFile(storybookOptionsOf(plugins).configDir),
    };
  }
  if (given !== undefined) {
    return { options: given };
  }
  const file = optionsFileIn(root);
  return file ? { file } : { options: {} };
};

/** `project`'s configuration: its options (`given`, or its options file's) with cucumber's defaults. */
export const configurationOfProject = async (
  given: CucumberOptions | undefined,
  project: OptionsProject,
): Promise<Configuration> => {
  const source = optionsSourceOf(given, project);
  if ("options" in source) {
    return configurationOf(source.options);
  }
  return configurationOf(await optionsIn(source.file));
};
