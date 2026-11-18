// Storybook: the support files' Storybook steps (`./storybookSteps.ts`), each file read and
// scanned for them, its scan kept by its text (`../../utils/fileCache.ts`: only a changed file is
// scanned again).
import { readFile } from "node:fs/promises";
import { fileCache } from "../../utils/fileCache.ts";
import { scanSupportCode, storybookStepsOf } from "./storybookSteps.ts";

/** Each support file's scan, by its text. */
const scans = fileCache<ReturnType<typeof scanSupportCode>>();

/** The Storybook steps of `supportFiles` (each one read; scanned unless unchanged). */
export const storybookStepsOfFiles = async (supportFiles: string[]) =>
  storybookStepsOf(
    await Promise.all(
      supportFiles.map(async (file) => {
        const content = await readFile(file, "utf8");
        return scans(file, content, () => scanSupportCode(content, file));
      }),
    ),
  );

/** Drops what's kept of deleted support file `file`. */
export const dropSupportFile = (file: string) => {
  scans.drop(file);
};
