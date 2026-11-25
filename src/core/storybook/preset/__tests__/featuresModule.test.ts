import { expect, test } from "vitest";
import { ownModule } from "../../../utils/ownModule.ts";
import {
  createFeaturesMap,
  featuresModuleCode,
  isFeaturesMap,
  mayBeFeaturesMap,
} from "../featuresModule.ts";

test("the map's code: the store filled with each stories file's features (their text written in: no import of a feature), the store's `features` and `onFeaturesChange` exported, and its own hot update accepted", () => {
  const features = {
    "./src/Header.stories.ts": [
      {
        fileName: "./src/Header.feature",
        source: 'Feature: Header\n  Scenario: "it\'s" `quoted`\n',
      },
    ],
  };
  const [first, ...rest] = featuresModuleCode(features).split("\n");
  expect(first).toBe(
    `import { features, fillFeatures, onFeaturesChange } from ${JSON.stringify(ownModule("worker/storybook/linkedFeatures"))};`,
  );
  const code = rest.join("\n");
  expect(code).not.toMatch(/\bimport\s*["(]|\bfrom\s*"/);
  expect(
    code.endsWith(
      "export { features, onFeaturesChange };\nif (import.meta.hot) import.meta.hot.accept();\n",
    ),
  ).toBe(true);
  // What the store is filled with: the map, as data.
  const filled: unknown[] = [];
  const body = code.split("\nexport {")[0];
  new Function("fillFeatures", body ?? "")((linked: unknown) => {
    filled.push(linked);
  });
  expect(filled).toEqual([features]);
});

test("the placeholder: its path as Vite writes it (any query), and the imports that may be it", () => {
  const placeholder = ownModule("worker/storybook/featuresMap");
  expect(isFeaturesMap(placeholder.replaceAll("\\", "/"))).toBe(true);
  expect(isFeaturesMap(`${placeholder}?v=1`)).toBe(true);
  expect(isFeaturesMap(ownModule("worker/storybook/features"))).toBe(false);
  expect(mayBeFeaturesMap("./featuresMap.mjs")).toBe(true);
  expect(mayBeFeaturesMap("./featuresMap.ts")).toBe(true);
  expect(mayBeFeaturesMap("./features.ts")).toBe(false);
});

test("a project's features map: made at each ask; made again, whether it's another than the one last made (never made: no)", async () => {
  const linked = {
    "./src/Header.stories.ts": [
      { fileName: "./src/Header.feature", source: "Feature: Header\n" },
    ],
  };
  let features: Record<string, { fileName: string; source: string }[]> = {};
  const map = createFeaturesMap(() => Promise.resolve(features));
  // No page has it yet.
  expect(await map.changed()).toBe(false);
  expect(await map.load()).toBe(featuresModuleCode({}));
  // As it was served (a feature saved as it was, one on no stories file).
  expect(await map.changed()).toBe(false);
  // A feature linked, or its text another: once, then the same again.
  features = linked;
  expect(await map.changed()).toBe(true);
  expect(await map.changed()).toBe(false);
  expect(await map.load()).toBe(featuresModuleCode(linked));
  // Two asks at once (the links' change and a file's event): one says so.
  features = {};
  expect(await Promise.all([map.changed(), map.changed()])).toEqual([
    true,
    false,
  ]);
});
