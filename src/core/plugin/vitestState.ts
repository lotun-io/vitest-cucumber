// What a plugin keeps of the Vitest it serves (Vitest's main process), held only while that Vitest is
// open. A plugin outlives its Vitest: Node never unloads the config module that made it (an ES
// module stays loaded), and a restart (a config file changed in watch mode, a programmatic Vitest's
// restart with the same plugins) gives it to the next Vitest. Anything it kept of a closed Vitest
// (its projects, Vitest itself) would keep that Vitest alive, and everything it holds (its Vite
// servers, its runs): so the state is dropped as its Vitest closes, made anew by the next one's
// first project; `opened` lets the plugin start what it does once per Vitest (its watcher's
// listeners), and `closed` drop what it derived from it. One Vitest at a time: a plugin is the
// next Vitest's only once its last one closed, or was replaced.
//
// The rest of main's state, none of it holding a closed Vitest:
// - a plugin's own (`./createPlugin.ts`): its root, cucumber's configuration (loaded once), and
//   the feature files' plans with what was read for them (`../feature/plans.ts`: dropped at each
//   run's start, all of it as its Vitest closes);
// - a Vitest's test runs (`../runs/testRuns.ts`, a `WeakMap` by its config), which hold its projects;
// - node mode's command server (`../commands/commands.ts`), one per Vitest, dropped as it closes;
// - Storybook's: in Storybook's own process its projects by config folder
//   (`../storybook/preset.ts`) and its dev server's source maps (`../storybook/preset/locate.ts`).
import type { TestProject, Vitest } from "vitest/node";

/** The open Vitest a plugin serves, and the plugin's projects in it. */
export interface VitestState {
  readonly vitest: Vitest;
  readonly projects: ReadonlySet<TestProject>;
}

/**
 * A plugin's state of its Vitest: `opened` is called with a Vitest as its first project uses the
 * plugin, `closed` as that Vitest closes.
 */
export const createVitestState = ({
  opened,
  closed,
}: {
  opened: (vitest: Vitest) => void;
  closed: () => void;
}) => {
  let current: { vitest: Vitest; projects: Set<TestProject> } | undefined;
  return {
    /** The open Vitest's state, if the plugin serves one. */
    current: (): VitestState | undefined => current,
    /** `project` of `vitest` uses the plugin (`configureVitest`). */
    add: (vitest: Vitest, project: TestProject) => {
      if (current?.vitest !== vitest) {
        const state = { vitest, projects: new Set<TestProject>() };
        current = state;
        vitest.onClose(() => {
          if (current === state) {
            current = undefined;
            closed();
          }
        });
        opened(vitest);
      }
      current.projects.add(project);
    },
  };
};
