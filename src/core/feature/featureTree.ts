// A feature file's Vitest tests, built from its Gherkin document and pickles, grouped the way
// cucumber's formatters group them: a suite per feature, rule and scenario outline, a test per
// scenario and example. Each suite and test carries its Gherkin line, so Vitest's `file:line`
// filters pick the same tests cucumber's would, and a test's line is the one its run selects.
import type {
  GherkinDocument,
  Location,
  Pickle,
  Rule,
  Scenario,
} from "@cucumber/messages";
import type { FeatureSuite, FeatureTest } from "../../types/feature.ts";

const suite = (name: string, { line, column = 1 }: Location): FeatureSuite => ({
  name,
  line,
  column,
  children: [],
});

export const featureTree = (
  uri: string,
  gherkinDocument: GherkinDocument | undefined,
  pickles: readonly Pickle[],
): FeatureSuite => {
  const feature = gherkinDocument?.feature;
  const root = suite(feature?.name || uri, feature?.location ?? { line: 1 });
  /** Each scenario by its id, with its rule if it has one. */
  const scenarios = new Map<string, { scenario: Scenario; rule?: Rule }>();
  for (const { scenario, rule } of feature?.children ?? []) {
    if (scenario) {
      scenarios.set(scenario.id, { scenario });
    }
    for (const child of rule?.children ?? []) {
      if (child.scenario) {
        scenarios.set(child.scenario.id, { scenario: child.scenario, rule });
      }
    }
  }
  /** Suites by their Gherkin node's id, so tests of the same rule or outline share one. */
  const suites = new Map<string, FeatureSuite>();
  const suiteOf = (
    parent: FeatureSuite,
    node: { id: string; name: string; location: Location },
  ) => {
    let child = suites.get(node.id);
    if (!child) {
      child = suite(node.name, node.location);
      suites.set(node.id, child);
      parent.children.push(child);
    }
    return child;
  };

  for (const pickle of pickles) {
    const [scenarioId = "", exampleId] = pickle.astNodeIds;
    const found = scenarios.get(scenarioId);
    if (!found) {
      continue;
    }
    const { scenario, rule } = found;
    let parent = rule ? suiteOf(root, rule) : root;
    if (exampleId !== undefined) {
      parent = suiteOf(parent, scenario);
    }
    const { line, column = 1 } = pickle.location ?? scenario.location;
    parent.children.push({
      name: pickle.name,
      line,
      column,
      tags: pickle.tags.map(({ name }) => name),
    });
  }
  return root;
};

/** Every test of `tree`, in order (its scenarios', and its Outlines' rows'). */
export const testsOf = (tree: FeatureSuite): FeatureTest[] =>
  tree.children.flatMap((child) =>
    "children" in child ? testsOf(child) : [child],
  );
