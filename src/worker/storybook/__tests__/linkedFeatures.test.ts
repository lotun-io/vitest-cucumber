import { beforeEach, expect, test, vi } from "vitest";
import { features, fillFeatures, onFeaturesChange } from "../linkedFeatures.ts";

const feature = (name: string, text = name) => ({
  fileName: `./${name}.feature`,
  source: `Feature: ${text}\n`,
});

beforeEach(() => {
  fillFeatures({});
});

test("filled: the map; filled again: the same object, its stories files added, changed and gone", () => {
  const a = [feature("a")];
  fillFeatures({ "./a.stories.ts": a, "./b.stories.ts": [feature("b")] });
  expect(features).toEqual({
    "./a.stories.ts": [feature("a")],
    "./b.stories.ts": [feature("b")],
  });
  // A stories file's list: the one it was filled with, until it's filled again.
  expect(features["./a.stories.ts"]).toBe(a);
  fillFeatures({ "./a.stories.ts": [feature("c")] });
  expect(features).toEqual({ "./a.stories.ts": [feature("c")] });
});

test("the listeners: told each time the map is filled, until stopped", () => {
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = onFeaturesChange(first);
  onFeaturesChange(second);
  fillFeatures({ "./a.stories.ts": [feature("a")] });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  stopFirst();
  fillFeatures({ "./a.stories.ts": [feature("a", "edited")] });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
});

test("a listener that stops itself as it's told: the others still told", () => {
  const other = vi.fn();
  const stop = onFeaturesChange(() => {
    stop();
  });
  onFeaturesChange(other);
  fillFeatures({});
  expect(other).toHaveBeenCalledTimes(1);
});
