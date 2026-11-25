import { expect, test, vi } from "vitest";
import type { TestProject, Vitest } from "vitest/node";
import { createVitestState } from "../vitestState.ts";

/** A Vitest, and what closes it (its `onClose` listeners called). */
const vitestOf = () => {
  const closing: (() => void)[] = [];
  return {
    vitest: {
      onClose: (listener: () => void) => {
        closing.push(listener);
      },
    } as unknown as Vitest,
    close: () => {
      for (const listener of closing) {
        listener();
      }
    },
  };
};

const project = (name: string) => ({ name }) as unknown as TestProject;

test("a Vitest's state: opened once, by its first project, however many of its projects use the plugin; its projects kept", () => {
  const opened = vi.fn();
  const state = createVitestState({ opened, closed: vi.fn() });
  expect(state.current()).toBeUndefined();
  const { vitest } = vitestOf();
  const [a, b] = [project("a"), project("b")];
  state.add(vitest, a);
  state.add(vitest, b);
  expect(opened.mock.calls).toEqual([[vitest]]);
  expect(state.current()?.vitest).toBe(vitest);
  expect([...(state.current()?.projects ?? [])]).toEqual([a, b]);
});

test("its Vitest closed: the state dropped, `closed` called; the next Vitest (a restart's) opened in turn", () => {
  const opened = vi.fn();
  const closed = vi.fn();
  const state = createVitestState({ opened, closed });
  const first = vitestOf();
  state.add(first.vitest, project("a"));
  first.close();
  expect(closed).toHaveBeenCalledTimes(1);
  expect(state.current()).toBeUndefined();
  const second = vitestOf();
  state.add(second.vitest, project("a"));
  expect(opened.mock.calls).toEqual([[first.vitest], [second.vitest]]);
  expect(state.current()?.vitest).toBe(second.vitest);
});

test("a Vitest replaced before it closed: its closing later drops nothing of the next one", () => {
  const closed = vi.fn();
  const state = createVitestState({ opened: vi.fn(), closed });
  const first = vitestOf();
  const second = vitestOf();
  state.add(first.vitest, project("a"));
  state.add(second.vitest, project("a"));
  first.close();
  expect(closed).not.toHaveBeenCalled();
  expect(state.current()?.vitest).toBe(second.vitest);
});
