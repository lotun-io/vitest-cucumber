import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { type WatchedVitest, watchVitest } from "../vitestWatcher.ts";

/** A Vitest, watching or not, its root server's watcher an event emitter. */
const vitestOf = (watch: boolean) => {
  const watcher = new EventEmitter();
  return {
    watcher,
    vitest: {
      config: { watch },
      vite: { watcher },
    } as unknown as WatchedVitest,
  };
};

test("a watching Vitest's watcher: every file added, changed or deleted to the listener", () => {
  const listener = vi.fn();
  const { vitest, watcher } = vitestOf(true);
  watchVitest(vitest, listener);
  watcher.emit("add", "/a.ts");
  watcher.emit("unlink", "/b.ts");
  watcher.emit("change", "/c.ts");
  expect(listener.mock.calls).toEqual([
    ["add", "/a.ts"],
    ["unlink", "/b.ts"],
    ["change", "/c.ts"],
  ]);
});

test("a Vitest that doesn't watch (`vitest run`): nothing listened to", () => {
  const { vitest, watcher } = vitestOf(false);
  watchVitest(vitest, vi.fn());
  expect(watcher.listenerCount("change")).toBe(0);
});
