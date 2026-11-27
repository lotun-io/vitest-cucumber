import { expect, test } from "vitest";
import { featuresIn, featuresOf, onFeaturesChange } from "../features.ts";

/** A map as the preset serves it in Storybook's preview (`core/storybook/preset/featuresModule.ts`). */
const features = {
  "./src/Header.stories.ts": [
    { fileName: "./features/Session.feature", source: "Feature: Session\n" },
    { fileName: "./src/Header.feature", source: "Feature: Header\n" },
  ],
};

test("a stories file's features, by its path as Storybook writes it (`./`) or without `./`", () => {
  const header = features["./src/Header.stories.ts"];
  expect(featuresIn(features, "./src/Header.stories.ts")).toEqual(header);
  expect(featuresIn(features, "src/Header.stories.ts")).toEqual(header);
});

test("a stories file outside Storybook's folder (`../`), or in a folder named with a dot: as Storybook writes them", () => {
  const card = [{ fileName: "./src/Card.feature", source: "Feature: Card\n" }];
  const outside = { "../shared/Card.stories.tsx": card };
  expect(featuresIn(outside, "../shared/Card.stories.tsx")).toEqual(card);
  const dotted = { "./.design/Card.stories.tsx": card };
  expect(featuresIn(dotted, "./.design/Card.stories.tsx")).toEqual(card);
  expect(featuresIn(dotted, ".design/Card.stories.tsx")).toEqual(card);
});

test("a stories file no feature runs on: none", () => {
  expect(featuresIn(features, "./src/Page.stories.ts")).toEqual([]);
});

test("a stories file's features: the same array at each ask (what React's `useSyncExternalStore` compares), none too", () => {
  expect(featuresIn(features, "src/Header.stories.ts")).toBe(
    featuresIn(features, "./src/Header.stories.ts"),
  );
  expect(featuresIn(features, "./src/Page.stories.ts")).toBe(
    featuresIn(features, "./src/Other.stories.ts"),
  );
});

test("outside Storybook's preview (story tests: the placeholder's own map): none, and a subscription that's never told", () => {
  expect(featuresOf("./src/Header.stories.ts")).toEqual([]);
  let told = 0;
  const stop = onFeaturesChange(() => {
    told += 1;
  });
  stop();
  expect(told).toBe(0);
});
