import { expect, test } from "vitest";
import { ownModule } from "../../../utils/ownModule.ts";
import {
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
