// Storybook: the code of a feature file's stories module, as each host serves it, from the feature
// as made for Storybook (`./storybookPlan.ts`: its `stories`, or its `error`), one of two blocks: the
// module's code (`./featureStories.ts`), or the module that gives the error (`../../utils/errorCode.ts`: every
// line of it written here). In story tests it's the feature's test module too: after its stories,
// its test tree as calls, written from the feature file's own text as node and browser mode's
// feature module is (`../../feature/treeCalls.ts`, `../../feature/featureModule.ts`).
import type MagicString from "magic-string";
import type { FailedPlan } from "../../feature/plans.ts";
import { treeCalls } from "../../feature/treeCalls.ts";
import { importSupportCode } from "../../support/importSupportCode.ts";
import { failingSuiteCode, throwCode } from "../../utils/errorCode.ts";
import { featureModuleOf } from "./featureRuntimeModule.ts";
import type { StorybookPlan } from "./storybookPlans.ts";
import { testTagsOf } from "./storybookTags.ts";

/**
 * The code of feature file `file`'s stories module in story tests, one of two blocks. A feature
 * that can't be made (`error`: its parse errors, its links): a suite whose body throws the error, so
 * its file fails with it and no tests (as the suite is collected, not as the module is imported,
 * which Vitest's browser tester would wrap: "Failed to import test file <path>"; the suite's name is
 * never shown), and a meta (the addon's transform reads the module as CSF, which needs one) with no
 * story; no map. Else its `stories`' code, then the feature's tests, as the feature's text gives
 * them:
 *
 *   <its stories module: its stories file's meta, a story per scenario>
 *   import { storyTests as __cucumberStoryTests } from "<its feature module>";
 *   const { describe, storyTest } = __cucumberStoryTests({ importSupport });
 *   describe("Cart", { line: 1, column: 1 }, () => {
 *   storyTest("Adding an item", { tags: ["@smoke"] }, { line: 2, column: 3 });
 *   … });
 *
 * `storyTests` gives the page its support code to load (the support files' import written here,
 * in the test file's own module: whoever follows a test file's imports finds them) and gives back
 * the calls (`../../../worker/storybook/vitest/tests.ts`): a suite's `describe`, a scenario's
 * `storyTest` (with its Gherkin tags but Storybook's own, its story's: `./storybookTags.ts`),
 * whose test is the addon's story test of the scenario at that line (the addon's
 * transform, which runs next, declares one per story after these). Its map (`magic-string`'s)
 * gives each call its Gherkin line and column and nothing else: where Vitest places every suite
 * and test as it lists them without running (`vitest list`). Each call also carries that place,
 * for a run: Vitest's page applies a `file:line` filter to where a call is in the module it
 * was served, before the map is read, and the addon prints the module again, its lines its own
 * (a feature module's in node and browser mode are the feature file's: no place written there).
 */
export const storiesModule = ({
  file,
  plan,
}: {
  file: string;
  plan: StorybookPlan | FailedPlan;
}): { code: string; map?: ReturnType<MagicString["generateMap"]> } => {
  if ("error" in plan) {
    return {
      code: [failingSuiteCode(plan.error), "export default {};"].join("\n"),
    };
  }
  const { content, featureTree, supportFiles, stories } = plan;
  const place = ({ line, column }: { line: number; column: number }) =>
    `{ line: ${String(line)}, column: ${String(column)} }`;
  const code = treeCalls({
    content,
    tree: featureTree,
    calls: {
      describe: (suite) =>
        `describe(${JSON.stringify(suite.name)}, ${place(suite)}, () => {`,
      test: (test) =>
        `storyTest(${JSON.stringify(test.name)}, { tags: ${JSON.stringify(testTagsOf(test.tags))} }, ${place(test)});`,
    },
  });
  code.prepend(
    [
      stories.code,
      `import { storyTests as __cucumberStoryTests } from ${JSON.stringify(featureModuleOf(file))};`,
      `const { describe, storyTest } = __cucumberStoryTests({ importSupport: ${importSupportCode(supportFiles)} });`,
      "",
    ].join("\n"),
  );
  return {
    code: code.toString(),
    map: code.generateMap({ source: file, includeContent: true }),
  };
};

/**
 * The code of a feature file's stories module in the preview, one of two blocks: its `stories`' code; or,
 * when it couldn't be made, its `error` thrown as the module is imported (Storybook's own index
 * stops on the feature first) and a meta with no story.
 */
export const storiesModulePreview = (plan: StorybookPlan | FailedPlan) => {
  if ("error" in plan) {
    return [throwCode(plan.error), "export default {};"].join("\n");
  }
  return plan.stories.code;
};
