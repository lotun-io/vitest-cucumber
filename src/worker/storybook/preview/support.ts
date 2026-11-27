// The preview's support module: a placeholder. Where the preset runs (Storybook's dev server and its
// builds), its Vite plugin serves this module's code instead (`../../../core/storybook/preset/previewPlugin.ts`,
// written by `../../../core/storybook/preset/supportModule.ts`): the support files' imports, and what the
// page's cucumber needs from main, written in as Storybook builds (a static build has no server to ask):
// the project's root, the run's options, cucumber's version. This file's code runs only without the
// preset: no `importSupport`, which the runner says (`./runner.ts`). Preview only.
import type { ImportSupport, RunOptions } from "../../../types/feature.ts";
import { defaultRunOptions } from "../../../utils/runOptions.ts";

/** Imports the support files, in order: none here (the preset serves this module's code). */
export const importSupport: ImportSupport | undefined = undefined;

/** The project's root, cucumber's `cwd`. */
export const cwd: string = "";

/** The run's options (cucumber's defaults here). */
export const options: RunOptions = defaultRunOptions;

/** Main's cucumber version. */
export const version: string = "";
