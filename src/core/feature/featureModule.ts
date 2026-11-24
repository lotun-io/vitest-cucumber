// The code of a feature file's test module, from its plan (`./plans.ts`), one of two blocks. A
// feature file that can't be used (its plan failed: it doesn't parse): a suite that throws its
// error, so its file fails with it and no tests (`../utils/errorCode.ts`), as Storybook's story
// tests do. A feature that can run: its test tree written as calls, made from the feature file's
// own text (`./treeCalls.ts`), each Vitest suite or test on its Gherkin line:
//
//   import { feature } from "<runtime>"; import { platform } from "<platform>"; const { describe, scenarioTest } = feature({ plan, platform, importSupport }); describe("Cart", () => {
//
//   scenarioTest("Adding an item", { tags: ["@smoke"] }, 3);
//   (a step's line: empty)
//   … });
//
// The first line, before its own call, imports the runtime and the mode's platform and gives
// `feature()` the file's plan (as plain data) and a function that imports the support files
// (imported from the module itself, so Vite reruns it when one changes); the runtime gives back
// the calls (`../../worker/feature/runtime.ts`). Every other line of the file is a line of the
// module: a suite's `describe`, a scenario's or example's `scenarioTest`, else empty. Its source
// map (`magic-string`'s) maps each call to its Gherkin line, which Vitest's static collection
// reads, and nothing else: an error's frame at a step's line
// (`../../worker/platform/errors/stacks.ts`) is on an empty line, which Vitest leaves as it is.
// A runtime function the generated code calls with more than one value takes them as one object.
import type MagicString from "magic-string";
import type { Feature } from "../../types/feature.ts";
import { importSupportCode } from "../support/importSupportCode.ts";
import { failingSuiteCode } from "../utils/errorCode.ts";
import { ownModule } from "../utils/ownModule.ts";
import type { FailedPlan, VitestPlan } from "./plans.ts";
import { treeCalls } from "./treeCalls.ts";

/** The runtime module, every mode's feature modules' (`../../worker/feature/runtime.ts`). */
const runtime = ownModule("worker/feature/runtime");

interface FeatureModuleOptions {
  /** The path of the mode's `Platform` module. */
  platform: string;
  /** The project's root, cucumber's `cwd`. */
  cwd: string;
  /** The feature file (its source map's source). */
  file: string;
  /** The feature file's plan. */
  plan: VitestPlan | FailedPlan;
}

export const featureModule = ({
  platform,
  cwd,
  file,
  plan,
}: FeatureModuleOptions): {
  code: string;
  map?: ReturnType<MagicString["generateMap"]>;
} => {
  if ("error" in plan) {
    return { code: failingSuiteCode(plan.error) };
  }
  const { uri, featureTree, gherkin, options, supportFiles, content } = plan;
  const feature: Omit<Feature, "featureTree"> = { cwd, uri, options, gherkin };
  const code = treeCalls({
    content,
    tree: featureTree,
    calls: {
      describe: ({ name }) => `describe(${JSON.stringify(name)}, () => {`,
      test: ({ name, tags, line }) =>
        `scenarioTest(${JSON.stringify(name)}, { tags: ${JSON.stringify(tags)} }, ${String(line)});`,
    },
  });
  code.prepend(
    [
      `import { feature } from ${JSON.stringify(runtime)};`,
      `import { platform } from ${JSON.stringify(platform)};`,
      `const { describe, scenarioTest } = feature({ plan: ${JSON.stringify(feature)}, platform, importSupport: ${importSupportCode(supportFiles).replaceAll("\n", " ")} });`,
    ].join(" ") + " ",
  );
  return {
    code: code.toString(),
    map: code.generateMap({ source: file, includeContent: true }),
  };
};
