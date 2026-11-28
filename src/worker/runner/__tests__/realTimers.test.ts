import { afterEach, expect, test, vi } from "vitest";
import { realTimers, saveRealTimers } from "../realTimers.ts";

const key = Symbol.for("@lotun/vitest-cucumber:realTimers");

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, key);
});

test("the timers and clock saved before a test's fake timers: a timeout fires, the clock moves", async () => {
  saveRealTimers();
  vi.useFakeTimers();
  const timers = realTimers();
  const started = timers.now();
  const startedPrecise = timers.performanceNow();
  // A fake `setTimeout` would never fire without `vi.advanceTimersByTime`.
  await new Promise<void>((resolve) => {
    timers.setTimeout(resolve, 20);
  });
  expect(timers.now() - started).toBeGreaterThanOrEqual(15);
  expect(timers.performanceNow() - startedPrecise).toBeGreaterThanOrEqual(15);
  // The fakes are left as they are: Date's is frozen.
  expect(Date.now()).toBe(Date.now());
  // A cleared timeout doesn't fire.
  let fired = false;
  const id = timers.setTimeout(() => {
    fired = true;
  }, 5);
  timers.clearTimeout(id);
  await new Promise<void>((resolve) => {
    timers.setTimeout(resolve, 20);
  });
  expect(fired).toBe(false);
});

test("saved once: a later save keeps the first", () => {
  saveRealTimers();
  const first = realTimers();
  saveRealTimers();
  expect(realTimers()).toBe(first);
});

test("none saved (Storybook's preview): the host's as they are", () => {
  expect(realTimers().now()).toBeGreaterThan(0);
});
