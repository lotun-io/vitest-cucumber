// Storybook: the addon's story tests of a feature file's stories module
// (`../stories/featureStoriesModule.ts`), as its transform generates them after the module's own
// code, handed to the plugin's runtime, two edits (`magic-string`, with the code's map).
//
// Its import of Vitest (`import { test as _test, expect as _expect } from "vitest"`) is taken from
// the feature module's `vitest` instead (Vitest's exports with `cucumberTests`'s `test`, which
// collects each scenario's story test instead of declaring it: `../stories/featureRuntimeModule.ts`,
// `../../../worker/storybook/vitest/tests.ts`), destructured into the addon's names (`const { test:
// _test, expect: _expect } = __cucumberVitest`): the feature's own calls, written before the
// addon's (`describe`, `storyTest`), are its tests, each running the story test collected for its
// line. A destructured `_test` is also no test to Vitest's static collection (`vitest list`
// reads calls by name: an imported `test` would be listed next to the feature's own). Only the
// import that has `test` (the addon's). The addon's other import, its test utilities, resolves to
// the feature module (`storyTestsModuleId`). A file with the test utilities but no such import
// fails: the addon's output changed (`CLAUDE.md`, "Updating Storybook").
//
// The module's code is put below the feature file's last line (as many empty lines before it as
// the feature has). An error's first frame is its step's line in the feature file
// (`../../../worker/platform/errors/stacks.ts`), which here is the test file itself: Vitest's page
// takes it for a place in this module and maps it. A feature module in node and browser mode has
// nothing on a step's line, so the frame stays; the addon prints the module again, its lines
// its own, and a step's line could be a mapped call's (the scenario's line printed for its
// step). Past the feature's last line no step has one.
import MagicString from "magic-string";
import { pluginError } from "../../../utils/errors.ts";

/** A named import from "vitest": its specifiers. */
const vitestImport = /import\s*\{([^}]*)\}\s*from\s*["']vitest["'];?/g;

/** `test as _test` as a destructuring's property (`test: _test`). */
const propertyOf = (specifier: string) => {
  const [imported = "", local] = specifier.split(/\s+as\s+/);
  return local ? `${imported}: ${local}` : imported;
};

/** The addon's Vitest import in `code` (the one that has `test`): where it is, its specifiers. */
const testImportOf = (code: string) => {
  for (const match of code.matchAll(vitestImport)) {
    const specifiers = (match[1] ?? "")
      .split(",")
      .map((specifier) => specifier.trim())
      .filter(Boolean);
    if (specifiers.some((specifier) => /^test(\s|$)/.test(specifier))) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        specifiers,
      };
    }
  }
  return undefined;
};

/**
 * `code` (the addon's output for feature file `file`'s stories module) with its Vitest import (the
 * one that has `test`) taken from `featureModule`'s `vitest` (none to take if the addon declared no
 * story tests in it, no import of `testUtils`: every story left out by its tags), below `lines`
 * empty lines (the feature file's number of lines), and its source map.
 */
export const vitestFromFeature = ({
  code,
  file,
  featureModule,
  testUtils,
  lines,
}: {
  code: string;
  file: string;
  featureModule: string;
  testUtils: string;
  lines: number;
}) => {
  const s = new MagicString(code);
  if (code.includes(testUtils)) {
    const found = testImportOf(code);
    if (!found) {
      throw pluginError(
        `Storybook's story tests of ${file} aren't declared as the plugin expects (\`test\` imported from "vitest"), so its scenarios' stories can't be declared as Vitest tests (your Storybook may be newer than the plugin supports)`,
        { quiet: true },
      );
    }
    s.overwrite(
      found.start,
      found.end,
      [
        `import { vitest as __cucumberVitest } from ${JSON.stringify(featureModule)};`,
        `const { ${found.specifiers.map(propertyOf).join(", ")} } = __cucumberVitest;`,
      ].join("\n"),
    );
  }
  s.prepend("\n".repeat(lines));
  return {
    code: s.toString(),
    map: s.generateMap({
      source: file,
      includeContent: true,
      hires: "boundary",
    }),
  };
};
