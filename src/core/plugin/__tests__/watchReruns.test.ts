import path from "node:path";
import { expect, test, vi } from "vitest";
import type { TestProject, Vitest } from "vitest/node";
import { createWatchReruns } from "../watchReruns.ts";

const root = path.resolve("/p");

/** A watching Vitest of `projects`, each with its test files: what it was told changed. */
const watching = (...projects: string[][]) => {
  const onFileChange = vi.fn();
  const vitest = { watcher: { onFileChange } } as unknown as Vitest;
  return {
    onFileChange,
    state: {
      vitest,
      projects: new Set(
        projects.map(
          (testFiles) =>
            ({
              globTestFiles: () => Promise.resolve({ testFiles }),
            }) as unknown as TestProject,
        ),
      ),
    },
  };
};

test("a feature file is taken as changed: Vitest's own handling of a changed file", () => {
  const { onFileChange, state } = watching();
  createWatchReruns(() => state).feature(path.join(root, "a.feature"));
  expect(onFileChange.mock.calls).toEqual([[path.join(root, "a.feature")]]);
});

test("every feature file: each of the projects' test files that is one, once", async () => {
  const a = path.join(root, "features/a.feature");
  const b = path.join(root, "features/b.feature.md");
  const { onFileChange, state } = watching(
    [a, path.join(root, "src/unit.test.ts")],
    [a, b],
  );
  await createWatchReruns(() => state).everyFeature();
  expect(onFileChange.mock.calls).toEqual([[a], [b]]);
});

test("no Vitest open: nothing", async () => {
  const reruns = createWatchReruns(() => undefined);
  reruns.feature(path.join(root, "a.feature"));
  await expect(reruns.everyFeature()).resolves.toBeUndefined();
});
