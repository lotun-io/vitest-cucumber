// Watch-mode reruns, in a watching Vitest (node mode, browser mode, story tests): how feature
// files' modules are made again as the plans say so (`../feature/plans.ts`'s `onFileChange`, told
// every file its watcher reports: `./createPlugin.ts`). Vitest takes a feature file as changed
// (`feature`, Vitest's own `onFileChange`: its module dropped, the file rerun; nothing on disk);
// when the support files' list changed, every feature file of its projects (`everyFeature`: their
// modules import the old list; Vitest wouldn't rerun anything by itself: no module imports a new
// file yet, and a deleted file triggers nothing), looked up then (one may have been added since).
import { featureFilesOf } from "./featureFiles.ts";
import type { VitestState } from "./vitestState.ts";

export const createWatchReruns = (
  /** The open Vitest the plugin serves, and its projects using the plugin (`./vitestState.ts`). */
  state: () => VitestState | undefined,
) => {
  /** The projects' feature files (`./featureFiles.ts`), whose modules import the support code. */
  const everyFeatureOf = async ({ projects }: VitestState) => {
    const files = await Promise.all([...projects].map(featureFilesOf));
    return [...new Set(files.flat())];
  };

  return {
    /** Takes feature file `file` as changed. */
    feature: (file: string) => {
      state()?.vitest.watcher.onFileChange(file);
    },
    /** The support files' list changed: every feature file taken as changed. */
    everyFeature: async () => {
      const current = state();
      if (current) {
        for (const file of await everyFeatureOf(current)) {
          current.vitest.watcher.onFileChange(file);
        }
      }
    },
  };
};
