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

/** The support files' import, as its code is written (`core/support/importSupportCode.ts`). */
const importSupport = 'async () => {\n  await import("/p/steps.ts");\n}';

describe("a feature's stories module's Vitest import, the feature module's", () => {
  test("the addon's import (with `test`) the feature module's `vitest`, destructured into its names, the feature declared after the addon's tests with the support files' import; another Vitest import as it is", () => {
    const result = vitestFromFeature({
      code: generated,
      file: "/p/Login.feature",
      featureModule,
      testUtils,
      importSupport,
    });
    expect(result?.code).toBe(
      [
        `import { vi } from "vitest";`,
        `import { vitest as __cucumberVitest, declareFeature as __cucumberDeclare } from "${featureModule}";`,
        "const { test: _test, expect: _expect } = __cucumberVitest;",
        `import { testStory as _testStory, convertToFilePath } from "${testUtils}";`,
        "export const LogIn = {};",
        `_test("Log in", _testStory({ exportName: "LogIn" }));`,
        "__cucumberDeclare({ importSupport: async () => {",
        '  await import("/p/steps.ts");',
        "} });",
        "",
      ].join("\n"),
    );
    expect(result?.map.sources).toEqual(["/p/Login.feature"]);
  });

  test("no story tests (no import of the test utilities): nothing", () => {
    expect(
      vitestFromFeature({
        code: "export const LogIn = {};",
        file: "/p/Login.feature",
        featureModule,
        testUtils,
        importSupport,
      }),
    ).toBeUndefined();
  });

  test("story tests without `test` imported from Vitest: the addon's output changed", () => {
    expect(() =>
      vitestFromFeature({
        code: `import { testStory } from "${testUtils}";`,
        file: "/p/Login.feature",
        featureModule,
        testUtils,
        importSupport,
      }),
    ).toThrow("aren't declared as the plugin expects");
  });
});
