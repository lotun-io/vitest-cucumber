// Vitest kept open in a scenario's project without a watcher: its tests run, then run again
// through its API as the scenario changes files unseen (no file event reaches Vitest or the
// plugin: what a rerun through Vitest's API sees of a change, and Storybook's Vitest addon's own
// Vitest, which removes the plugin's listeners). Nothing is taken as changed for it (`./kept.ts`
// takes every file of `features/` as changed before each of its runs): what a run reads again
// is the plugin's own doing.
import { createVitest } from "vitest/node";
import { checkPluginModules } from "./config.ts";
import { capture, collectGarbage, runResult, showExit } from "./run.ts";
import { featureStoriesFiles } from "./storybookProject.ts";
import type { E2EWorld } from "./world.ts";

/** Opens Vitest in the scenario's project, not watching: `world.open` runs its tests. */
export async function openVitest(this: E2EWorld) {
  // A Storybook project's runs: its feature files as stories (see `featureStoriesFiles`).
  const asFeatureRun =
    this.mode === "storybook"
      ? await featureStoriesFiles.call(this)
      : undefined;
  const output = capture();
  const vitest = await createVitest(
    // As `startSession`'s.
    { root: this.dir, watch: false, silent: false, cache: false },
    {},
    { stdout: output.stream, stderr: output.stream },
  );
  await vitest.standalone();
  this.open = {
    /** Runs every test file of the project as it is now: the scenario's last run. */
    run: async () => {
      vitest.clearSpecificationsCache();
      const specifications = await vitest.globTestSpecifications();
      output.clear();
      // Vitest sets the run's result as the process' exit code: this process'.
      const { exitCode } = process;
      process.exitCode = undefined;
      const restoreExit = showExit(output);
      try {
        await vitest.runTestSpecifications(specifications);
        checkPluginModules(vitest);
        const run = runResult(
          vitest,
          this.dir,
          { exitCode: Number(process.exitCode ?? 0), output: output.text() },
          specifications,
        );
        this.result = asFeatureRun ? await asFeatureRun(run) : run;
      } finally {
        restoreExit();
        process.exitCode = exitCode;
      }
    },
    close: async () => {
      await vitest.close();
      collectGarbage();
    },
  };
}
