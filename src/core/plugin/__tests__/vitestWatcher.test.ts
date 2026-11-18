import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { createVitestWatcher, type WatchedVitest } from "../vitestWatcher.ts";

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

test("a watching Vitest's watcher: every file added, changed or deleted to the listener, listened to once however many projects configure it", () => {
  const listener = vi.fn();
  const watch = createVitestWatcher(listener);
  const { vitest, watcher } = vitestOf(true);
  watch(vitest);
  watch(vitest);
  watcher.emit("add", "/a.ts");
  watcher.emit("unlink", "/b.ts");
  watcher.emit("change", "/c.ts");
  expect(listener.mock.calls).toEqual([
    ["add", "/a.ts"],
    ["unlink", "/b.ts"],
    ["change", "/c.ts"],
  ]);
});

test("each Vitest listened to (a restart's new one too)", () => {
  const listener = vi.fn();
  const watch = createVitestWatcher(listener);
  const first = vitestOf(true);
  const second = vitestOf(true);
  watch(first.vitest);
  watch(second.vitest);
  first.watcher.emit("change", "/a.ts");
  second.watcher.emit("change", "/b.ts");
  expect(listener.mock.calls).toEqual([
    ["change", "/a.ts"],
    ["change", "/b.ts"],
  ]);
});

test("a Vitest that doesn't watch (`vitest run`): nothing listened to", () => {
  const { vitest, watcher } = vitestOf(false);
  createVitestWatcher(vi.fn())(vitest);
  expect(watcher.listenerCount("change")).toBe(0);
});
