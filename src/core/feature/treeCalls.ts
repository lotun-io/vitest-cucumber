// A feature file's test tree written as calls, into the feature file's own text (`magic-string`,
// so its map gives each call its Gherkin line and column): a suite (a feature, a rule, an
// outline) a `describe(name, … () => {` on its Gherkin line, its children inside, its `});` on its
// last child's line; a scenario's or an example's test a call on its own; every other line
// emptied, its newline kept. What Vitest's static collection reads (`vitest list`: the calls named
// `describe` and `…Test`, their names, their `tags` literals, their places through the module's
// map), and what declares the tests as the module runs: every mode's test module has them
// (`./featureModule.ts`; Storybook's story tests: `../storybook/stories/featureStoriesModule.ts`),
// each writing its own calls.
import MagicString from "magic-string";
import type { FeatureSuite, FeatureTest } from "../../types/feature.ts";

/** A line's calls, written from its first one's column (its Gherkin keyword's). */
interface LineCalls {
  column: number;
  calls: string[];
}

/** How a mode writes a suite's call (opening its body: `… () => {`) and a test's. */
interface TreeCalls {
  describe: (suite: FeatureSuite) => string;
  test: (test: FeatureTest) => string;
}

/**
 * The calls of `suite`'s children, each on its line (`lines`, by line number), a suite's `});` on
 * its last child's line: the last line of them (`suite`'s own if it has none).
 */
const childCalls = (
  suite: FeatureSuite,
  calls: TreeCalls,
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
      add(child.line, child.column, calls.describe(child));
      const end = childCalls(child, calls, lines);
      add(end, child.column, "});");
      last = Math.max(last, end);
    } else {
      add(child.line, child.column, calls.test(child));
      last = Math.max(last, child.line);
    }
  }
  return last;
};

/**
 * `content` (a feature file's text, as its `tree` was made from) as its tree's calls, written by
 * `calls` (a test's function a name ending in `Test`: Vitest's static collection takes it for a
 * test's): to be given what comes before them (`prepend`: what defines the functions called),
 * then its code and its map taken.
 */
export const treeCalls = ({
  content,
  tree,
  calls,
}: {
  content: string;
  tree: FeatureSuite;
  calls: TreeCalls;
}): MagicString => {
  // The calls on each line: the feature's own suite (none if it has no name: its children are the
  // file's), then its children's.
  const lines = new Map<number, LineCalls>();
  if (tree.name === "") {
    childCalls(tree, calls, lines);
  } else {
    lines.set(tree.line, {
      column: tree.column,
      calls: [calls.describe(tree)],
    });
    const end = childCalls(tree, calls, lines);
    lines.get(end)?.calls.push("});");
  }
  const code = new MagicString(content);
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
  return code;
};
