// Vitest kept open in a scenario's project without a watcher: its tests run, then run again
// through its API as the scenario changes files unseen (no file event reaches Vitest or the
// plugin: what a rerun through Vitest's API sees of a change, and Storybook's Vitest addon's own
// Vitest, which removes the plugin's listeners). Nothing is taken as changed for it (`./kept.ts`
// takes every file of `features/` as changed before each of its runs): what a run reads again
// is the plugin's own doing.
import {
  collectGarbage,
  openVitestIn,
  runTestFiles,
  testFilesOf,
} from "./run.ts";
import { runAs } from "./storybookProject.ts";
import type { E2EWorld } from "./world.ts";

/** Opens Vitest in the scenario's project, not watching: `world.open` runs its tests. */
export async function openVitest(this: E2EWorld) {
  // A Storybook project's runs: its feature files as stories (see `featureStoriesFiles`).
  const asRun = await runAs.call(this);
  const open = await openVitestIn(this.dir);
  this.open = {
    /** Runs every test file of the project as it is now: the scenario's last run. */
    run: async () => {
      this.result = await asRun(
        await runTestFiles(open, this.dir, await testFilesOf(open.vitest)),
      );
    },
    close: async () => {
      await open.vitest.close();
      collectGarbage();
    },
  };
}
