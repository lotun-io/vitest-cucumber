// Storybook: the support files' Storybook steps (`./storybookSteps.ts`), each file read and
// scanned for them, its scan kept by its text (`../../utils/fileCache.ts`: only a changed file is
// scanned again).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { locatedError } from "../../../utils/errors.ts";
import { slash } from "../../../utils/slash.ts";
import { fileCache } from "../../utils/fileCache.ts";
import { fileErrorReason } from "../../utils/fileErrorReason.ts";
import { scanSupportCode, storybookStepsOf } from "./storybookSteps.ts";

/** Each support file's scan, by its text (its places by the file's full path). */
const scans = fileCache<ReturnType<typeof scanSupportCode>>();

/**
 * The Storybook steps of `supportFiles` (each one read; scanned unless unchanged), each at its
 * place from the project's `root`.
 */
export const storybookStepsOfFiles = async (
  supportFiles: string[],
  root: string,
) =>
  storybookStepsOf(
    await Promise.all(
      supportFiles.map(async (file) => {
        // Kept by its text alone (its places by its full path), each place then from `root`: a
        // process may hold hosts of other roots (the preset's project, the story tests' plugin).
        const relative = slash(path.relative(root, file));
        // One that can't be read: every Storybook feature's error (the plugin's, its place).
        const content = await readFile(file, "utf8").catch((error: unknown) => {
          throw locatedError(
            `the support file can't be read (${fileErrorReason(error)})`,
            [relative],
          );
        });
        return scans(file, content, () => scanSupportCode(content, file)).map(
          (found) => ({
            ...found,
            at: `${relative}${found.at.slice(file.length)}`,
          }),
        );
      }),
    ),
  );

/** Drops what's kept of deleted support file `file`. */
export const dropSupportFile = (file: string) => {
  scans.drop(file);
};
