import { expect, test, vi } from "vitest";
import { createPlanCache } from "../planCache.ts";

const made = (value: string) => vi.fn(() => Promise.resolve(value));

test("a key's value is made at the first ask, the same from then on, each key its own", async () => {
  const cache = createPlanCache().of<string>();
  const make = made("a");
  const first = cache("a", make);
  expect(cache("a", made("other"))).toBe(first);
  expect(await first).toBe("a");
  expect(make).toHaveBeenCalledTimes(1);
  expect(await cache("b", made("b"))).toBe("b");
});

test("clear(): every cache makes its values again at their next ask; drop(): one key's", async () => {
  const caches = createPlanCache();
  const texts = caches.of<string>();
  const lists = caches.of<string[]>();
  await texts("a", made("one"));
  await texts("b", made("b"));
  await lists("l", () => Promise.resolve(["x"]));
  texts.drop("a");
  expect(await texts("a", made("two"))).toBe("two");
  expect(await texts("b", made("other"))).toBe("b");
  caches.clear();
  expect(await texts("b", made("again"))).toBe("again");
  expect(await lists("l", () => Promise.resolve(["y"]))).toEqual(["y"]);
});

test("changed(): makes the value again and keeps it; whether it's another than the one last made, by the cache's `same`", async () => {
  const caches = createPlanCache();
  const lists = caches.of<string[]>({
    same: (a, b) => a.join() === b.join(),
  });
  const list =
    (...files: string[]) =>
    () =>
      Promise.resolve(files);
  // Never made: nothing was made from it, so not changed; made now.
  expect(await lists.changed("l", list("a"))).toBe(false);
  expect(await lists("l", list("never asked"))).toEqual(["a"]);
  // The same (another array of the same files), then another.
  expect(await lists.changed("l", list("a"))).toBe(false);
  expect(await lists.changed("l", list("a", "b"))).toBe(true);
  expect(await lists("l", list("never asked"))).toEqual(["a", "b"]);
});

test("changed() compares with the value last made, cleared since or not; a dropped key was never made", async () => {
  const caches = createPlanCache();
  const texts = caches.of<string>();
  await texts("a", made("one"));
  caches.clear();
  expect(await texts.changed("a", made("one"))).toBe(false);
  caches.clear();
  expect(await texts.changed("a", made("two"))).toBe(true);
  texts.drop("a");
  expect(await texts.changed("a", made("three"))).toBe(false);
});

test("a value that fails: its error its askers', none unhandled; another than any other for changed()", async () => {
  const cache = createPlanCache().of<string>();
  const failing = () => Promise.reject(new Error("no"));
  await expect(cache("a", failing)).rejects.toThrow("no");
  // Failed before, made now; made before, failing now.
  expect(await cache.changed("a", made("one"))).toBe(true);
  expect(await cache.changed("a", failing)).toBe(true);
  await expect(cache("a", made("unused"))).rejects.toThrow("no");
});

test("keep(): out of clear(), emptied by dispose(), with every cache", async () => {
  const caches = createPlanCache();
  const texts = caches.of<string>();
  const kept = caches.keep(new Map([["a", 1]]));
  await texts("a", made("one"));
  caches.clear();
  expect(kept.size).toBe(1);
  caches.dispose();
  expect(kept.size).toBe(0);
  // Forgotten: never made.
  expect(await texts.changed("a", made("two"))).toBe(false);
});

test("single(): one value, no key, its maker given once; cleared, dropped and compared as any cache's", async () => {
  const caches = createPlanCache();
  let files = ["a"];
  const make = vi.fn(() => Promise.resolve([...files]));
  const list = caches.single({
    make,
    same: (a: string[], b: string[]) => a.join() === b.join(),
  });
  expect(await list()).toEqual(["a"]);
  expect(await list()).toEqual(["a"]);
  expect(make).toHaveBeenCalledTimes(1);
  // The same again, then another.
  expect(await list.changed()).toBe(false);
  files = ["a", "b"];
  expect(await list.changed()).toBe(true);
  expect(await list()).toEqual(["a", "b"]);
  // Cleared: made again at the next ask; the one last made is what it's compared with.
  caches.clear();
  expect(await list.changed()).toBe(false);
  // Dropped: never made.
  list.drop();
  files = ["c"];
  expect(await list.changed()).toBe(false);
  expect(await list()).toEqual(["c"]);
});
