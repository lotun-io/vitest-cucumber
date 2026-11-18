// Storybook: the addon's story tests of a feature file's stories module (`../stories/featureStories.ts`), as
// its transform generates them: its import of Vitest (`import { test as _test, expect as _expect }
// from "vitest"`) taken from the feature module's `vitest` instead (Vitest's exports with
// `cucumberTests`'s `test`, which collects each scenario's test: `../stories/featureRuntimeModule.ts`,
// `../../../worker/storybook/vitest/tests.ts`), destructured into the addon's names (`const { test:
// _test, expect: _expect } = __cucumberVitest`), and the feature module's `declareFeature()` called
// after the addon's tests: the feature's tests declared as node and browser mode declare them (its
// suites, each test at its Gherkin line), with the support files' import written here, in the
// test file's own module, as a feature file's module has it in node and browser mode
// (`feature({ plan, platform, importSupport })`: `../../feature/featureModule.ts`): whoever follows
// a test file's imports finds its support code (Vitest; Storybook's addon, which follows only
// imports that are files on disk and so never reached it behind the feature module's id).
// A `magic-string` edit, with the code's map. Only the
// import that has `test` (the addon's). The addon's other import, its test utilities, resolves to
// the feature module (`storyTestsModuleId`). A file with the test utilities but no such import fails:
// the addon's output changed (`CLAUDE.md`, "Updating Storybook").
import MagicString from "magic-string";
import { pluginError } from "../../../utils/errors.ts";

/** A named import from "vitest": its specifiers. */
const vitestImport = /import\s*\{([^}]*)\}\s*from\s*["']vitest["'];?/g;

/** `test as _test` as a destructuring's property (`test: _test`). */
const propertyOf = (specifier: string) => {
  const [imported = "", local] = specifier.split(/\s+as\s+/);
  return local ? `${imported}: ${local}` : imported;
};

/**
 * `code` (the addon's output for feature file `file`'s stories) with its Vitest import (the one that
 * has `test`) taken from `featureModule`'s `vitest`, then its `declareFeature()` called with
 * `importSupport` (the code of the support files' import: `../../support/importSupportCode.ts`),
 * and its source map; `undefined` if the addon declared no tests in it (no import of `testUtils`).
 */
export const vitestFromFeature = ({
  code,
  file,
  featureModule,
  testUtils,
  importSupport,
}: {
  code: string;
  file: string;
  featureModule: string;
  testUtils: string;
  importSupport: string;
}) => {
  if (!code.includes(testUtils)) {
    return undefined;
  }
  for (const match of code.matchAll(vitestImport)) {
    const specifiers = (match[1] ?? "")
      .split(",")
      .map((specifier) => specifier.trim())
      .filter(Boolean);
    if (!specifiers.some((specifier) => /^test(\s|$)/.test(specifier))) {
      continue;
    }
    const s = new MagicString(code);
    s.overwrite(
      match.index,
      match.index + match[0].length,
      [
        `import { vitest as __cucumberVitest, declareFeature as __cucumberDeclare } from ${JSON.stringify(featureModule)};`,
        `const { ${specifiers.map(propertyOf).join(", ")} } = __cucumberVitest;`,
      ].join("\n"),
    );
    s.append(`\n__cucumberDeclare({ importSupport: ${importSupport} });\n`);
    return {
      code: s.toString(),
      map: s.generateMap({
        source: file,
        includeContent: true,
        hires: "boundary",
      }),
    };
  }
  throw pluginError(
    `Storybook's story tests of ${file} aren't declared as the plugin expects (\`test\` imported from "vitest"): its scenarios' stories can't be declared as Vitest tests`,
    { quiet: true },
  );
};
