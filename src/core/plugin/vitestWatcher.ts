// Files as a watching Vitest sees them added, changed or deleted: its root server's watcher
// (`vitest.vite.watcher`), not Vite's `watchChange` hook. A project's server never watches
// (Vitest's `vitest:project` plugin sets `server.watch` to null: "the top-level server owns the
// watcher"), so a plugin in `test.projects` would get no `watchChange`. Listened to as its Vitest
// opens (`./vitestState.ts`: once, however many of its projects configure the plugin), and only
// while it watches (`vitest run` has no watcher to listen to).
import type { Vitest } from "vitest/node";
import type { FileChange } from "../feature/plans.ts";

/** What a listener is told: how a file changed, and its path (as the watcher gives it). */
export type FileChangeListener = (type: FileChange, file: string) => void;

/** A watching Vitest, as this reads it. */
export type WatchedVitest = Pick<Vitest, "config" | "vite">;

/** Tells `listener` every file `vitest`'s watcher reports, if it watches. */
export const watchVitest = (
  vitest: WatchedVitest,
  listener: FileChangeListener,
) => {
  if (!vitest.config.watch) {
    return;
  }
  for (const type of ["add", "change", "unlink"] as const) {
    vitest.vite.watcher.on(type, (file) => {
      listener(type, file);
    });
  }
};
