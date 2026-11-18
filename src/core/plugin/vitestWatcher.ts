// Files as a watching Vitest sees them added, changed or deleted: its root server's watcher
// (`vitest.vite.watcher`), not Vite's `watchChange` hook. A project's server never watches
// (Vitest's `vitest:project` plugin sets `server.watch` to null: "the top-level server owns the
// watcher"), so a plugin in `test.projects` would get no `watchChange`. Listened to once per Vitest
// (each of its projects configures the plugin), and only while it watches (`vitest run` has no
// watcher to listen to).
import type { Vitest } from "vitest/node";

/** How a file changed, as the watcher names it. */
export type FileChange = "add" | "change" | "unlink";

/** What a listener is told: how a file changed, and its path (as the watcher gives it). */
export type FileChangeListener = (type: FileChange, file: string) => void;

/** A watching Vitest, as this reads it. */
export type WatchedVitest = Pick<Vitest, "config" | "vite">;

/** Tells `listener` every file a Vitest's watcher reports, once per Vitest, if it watches. */
export const createVitestWatcher = (listener: FileChangeListener) => {
  const watched = new WeakSet<WatchedVitest>();
  return (vitest: WatchedVitest) => {
    if (!vitest.config.watch || watched.has(vitest)) {
      return;
    }
    watched.add(vitest);
    for (const type of ["add", "change", "unlink"] as const) {
      vitest.vite.watcher.on(type, (file) => {
        listener(type, file);
      });
    }
  };
};
