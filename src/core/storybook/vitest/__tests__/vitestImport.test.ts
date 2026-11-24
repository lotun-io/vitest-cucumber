import { describe, expect, test } from "vitest";
import { vitestFromFeature } from "../vitestImport.ts";

const testUtils = "@storybook/addon-vitest/internal/test-utils";
const featureModule = "/p/Login.feature?vitest-cucumber-storybook";

/** The addon's output for a stories file, as its transform generates it. */
const generated = [
  `import { vi } from "vitest";`,
  `import { test as _test, expect as _expect } from "vitest";`,
  `import { testStory as _testStory, convertToFilePath } from "${testUtils}";`,
  "export const LogIn = {};",
  `_test("Log in", _testStory({ exportName: "LogIn" }));`,
].join("\n");

describe("a feature's stories module after the addon's transform: its Vitest import the feature module's, its code below the feature's lines", () => {
  test("the addon's import (with `test`) the feature module's `vitest`, destructured into its names; another Vitest import as it is; as many empty lines before the code as the feature has", () => {
    const result = vitestFromFeature({
      code: generated,
      file: "/p/Login.feature",
      featureModule,
      testUtils,
      lines: 3,
    });
    expect(result.code).toBe(
      [
        "",
        "",
        "",
        `import { vi } from "vitest";`,
        `import { vitest as __cucumberVitest } from "${featureModule}";`,
        "const { test: _test, expect: _expect } = __cucumberVitest;",
        `import { testStory as _testStory, convertToFilePath } from "${testUtils}";`,
        "export const LogIn = {};",
        `_test("Log in", _testStory({ exportName: "LogIn" }));`,
      ].join("\n"),
    );
    expect(result.map.sources).toEqual(["/p/Login.feature"]);
  });

  test("no story tests (no import of the test utilities: every story left out by its tags): its code as it is, below the feature's lines", () => {
    expect(
      vitestFromFeature({
        code: "export const LogIn = {};",
        file: "/p/Login.feature",
        featureModule,
        testUtils,
        lines: 2,
      }).code,
    ).toBe("\n\nexport const LogIn = {};");
  });

  test("story tests without `test` imported from Vitest: the addon's output changed", () => {
    expect(() =>
      vitestFromFeature({
        code: `import { testStory } from "${testUtils}";`,
        file: "/p/Login.feature",
        featureModule,
        testUtils,
        lines: 1,
      }),
    ).toThrow("aren't declared as the plugin expects");
  });
});
