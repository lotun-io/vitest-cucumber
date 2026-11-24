// The code of a feature file's test module, from its plan (`./plans.ts`), one of two blocks. A
// feature file that can't be used (its plan failed: it doesn't parse): a suite that throws its
// error, so its file fails with it and no tests (`../utils/errorCode.ts`), as Storybook's story
// tests do. A feature that can run: its test tree written as calls, made from the feature file's
// own text (`magic-string`), each Vitest suite or test on its Gherkin line:
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
// module: a suite's `describe` (a feature, a rule, an outline: its children inside, its `});` on
// its last child's line), a scenario's or example's `scenarioTest`, else empty. Its source map
// (`magic-string`'s) maps each call to its Gherkin line, which Vitest's static collection reads
// (`vitest list`: the calls named `describe` and `…Test`, their names and their `tags` literals),
// and nothing else: an error's frame at a step's line (`../../worker/platform/errors/stacks.ts`)
// is on an empty line, which Vitest leaves as it is. A runtime function the generated code calls
// with more than one value takes them as one object.
import MagicString from "magic-string";
import type {
  Feature,
  FeatureSuite,
  FeatureTest,
} from "../../types/feature.ts";
import { importSupportCode } from "../support/importSupportCode.ts";
import { failingSuiteCode } from "../utils/errorCode.ts";
import { ownModule } from "../utils/ownModule.ts";
import type { FailedPlan, VitestPlan } from "./plans.ts";

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

/** A line's calls, written from its first one's column (its Gherkin keyword's). */
interface LineCalls {
  column: number;
  calls: string[];
}

/** `suite`'s call, opening its body (its children's calls, then its `});`). */
const describeCall = ({ name }: FeatureSuite) =>
  `describe(${JSON.stringify(name)}, () => {`;

/** A scenario's or an example's call. */
const testCall = ({ name, tags, line }: FeatureTest) =>
  `scenarioTest(${JSON.stringify(name)}, { tags: ${JSON.stringify(tags)} }, ${String(line)});`;

/**
 * The calls of `suite`'s children, each on its line (`lines`, by line number), a suite's `});` on
 * its last child's line: the last line of them (`suite`'s own if it has none).
 */
const childCalls = (
  suite: FeatureSuite,
  lines: Map<number, LineCalls>,
): number => {
  const add = (line: number, column: number, call: string) => {
    const at = lines.get(line);
    if (at) {
      at.calls.push(call);
    } else {
      lines.set(line, { column, calls: [call] });
    }
  };
  let last = suite.line;
  for (const child of suite.children) {
    if ("children" in child) {
      add(child.line, child.column, describeCall(child));
      const end = childCalls(child, lines);
      add(end, child.column, "});");
      last = Math.max(last, end);
    } else {
      add(child.line, child.column, testCall(child));
      last = Math.max(last, child.line);
    }
  }
  return last;
};

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
  // The calls on each line: the feature's own suite (none if it has no name: its children are the
  // file's), then its children's.
  const lines = new Map<number, LineCalls>();
  if (featureTree.name === "") {
    childCalls(featureTree, lines);
  } else {
    lines.set(featureTree.line, {
      column: featureTree.column,
      calls: [describeCall(featureTree)],
    });
    const end = childCalls(featureTree, lines);
    lines.get(end)?.calls.push("});");
  }
  const code = new MagicString(content);
  code.prepend(
    [
      `import { feature } from ${JSON.stringify(runtime)};`,
      `import { platform } from ${JSON.stringify(platform)};`,
      `const { describe, scenarioTest } = feature({ plan: ${JSON.stringify(feature)}, platform, importSupport: ${importSupportCode(supportFiles).replaceAll("\n", " ")} });`,
    ].join(" ") + " ",
  );
  // Each line its calls, from its keyword's column (so the map gives the Gherkin line and column),
  // or nothing: its newline kept, so every call stays on its Gherkin line.
  let start = 0;
  for (const [index, text] of content.split("\n").entries()) {
    const end = start + text.length;
    const at = lines.get(index + 1);
    if (at) {
      const keyword = Math.min(start + at.column - 1, end);
      if (keyword > start) {
        code.remove(start, keyword);
      }
      if (end > keyword) {
        code.overwrite(keyword, end, at.calls.join(" "));
      } else {
        code.appendLeft(keyword, at.calls.join(" "));
      }
    } else if (end > start) {
      code.remove(start, end);
    }
    start = end + 1;
  }
  return {
    code: code.toString(),
    map: code.generateMap({ source: file, includeContent: true }),
  };
};
