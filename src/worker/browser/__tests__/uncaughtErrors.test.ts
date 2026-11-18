import { afterEach, expect, test, vi } from "vitest";
import { createUncaughtErrors } from "../uncaughtErrors.ts";

/** A window stand-in: its `error` listeners, as Vitest's page has them. */
const pageWindow = () => {
  const target = new EventTarget();
  const listeners = { count: 0 };
  vi.stubGlobal("addEventListener", (type: string, listener: () => void) => {
    listeners.count++;
    target.addEventListener(type, listener);
  });
  vi.stubGlobal("removeEventListener", (type: string, listener: () => void) => {
    listeners.count--;
    target.removeEventListener(type, listener);
  });
  /** Dispatches an uncaught error (an `ErrorEvent`'s `error`). */
  const throwUncaught = (error: unknown) =>
    target.dispatchEvent(Object.assign(new Event("error"), { error }));
  return { listeners, throwUncaught };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("an uncaught error while it runs fails it; its listener removed after", async () => {
  const { listeners, throwUncaught } = pageWindow();
  const uncaught = createUncaughtErrors();
  const raced = uncaught.race(new Promise(() => {}));
  expect(listeners.count).toBe(1);
  const error = new Error("Thrown in a timer");
  throwUncaught(error);
  await expect(raced).rejects.toBe(error);
  expect(listeners.count).toBe(0);
});

test("its own outcome otherwise; no listener after", async () => {
  const { listeners } = pageWindow();
  await expect(
    createUncaughtErrors().race(Promise.resolve("value")),
  ).resolves.toBe("value");
  expect(listeners.count).toBe(0);
});

test("an event without an error, not one", async () => {
  const { throwUncaught } = pageWindow();
  let finish = () => {};
  const raced = createUncaughtErrors().race(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  throwUncaught(undefined);
  finish();
  await expect(raced).resolves.toBeUndefined();
});

test("a call that never ends: `stopAll` removes its listener", () => {
  const { listeners } = pageWindow();
  const uncaught = createUncaughtErrors();
  void uncaught.race(new Promise(() => {}));
  expect(listeners.count).toBe(1);
  uncaught.stopAll();
  expect(listeners.count).toBe(0);
});

test("no window (Node): the call as it is", async () => {
  await expect(
    createUncaughtErrors().race(Promise.resolve("value")),
  ).resolves.toBe("value");
});
