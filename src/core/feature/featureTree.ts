// A feature file's Vitest tests, built from its Gherkin document and pickles, grouped the way
// cucumber's formatters group them: a suite per feature, rule and scenario outline, a test per
// scenario and example. Each suite and test carries its Gherkin line, so Vitest's `file:line`
// filters pick the same tests cucumber's would, and a test's line is the one its run selects.
// An empty name has a fallback (the user's calls, 2026-11-20): an unnamed feature has no suite,
// its children under the file (Vitest prints the file's path); a rule, a scenario or an outline is
// named by its keyword as written (`Rule`, `Scenario`, `Example`, `Scenario Outline`); an example
// whose name is empty (its outline's is) by its language's `Example` keyword (Gherkin's primary
// scenario keyword, first in each dialect's list: `Exemple`, `Beispiel`; a language without one,
// its scenario keyword). Storybook's sidebar shows the same tree (`placesOf`:
// `../storybook/stories/featureStories.ts`).
import { dialects } from "@cucumber/gherkin";
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

/**
 * The name of an example whose own is empty (its outline has none): its language's `Example`
 * keyword, Gherkin's primary scenario keyword (https://cucumber.io/docs/gherkin/reference/: "Example
 * (or Scenario)"), first in each dialect's list.
 */
const exampleName = (language: string) =>
  dialects[language]?.scenario[0] ?? "Example";

export const featureTree = (
  uri: string,
  gherkinDocument: GherkinDocument | undefined,
  pickles: readonly Pickle[],
): FeatureSuite => {
  const feature = gherkinDocument?.feature;
  // An unnamed feature: no suite (`../../worker/feature/registerFeature.ts`).
  const root = suite(feature?.name ?? "", feature?.location ?? { line: 1 });
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
    node: { id: string; keyword: string; name: string; location: Location },
  ) => {
    let child = suites.get(node.id);
    if (!child) {
      child = suite(node.name || node.keyword, node.location);
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
    const isExample = exampleId !== undefined;
    if (isExample) {
      parent = suiteOf(parent, scenario);
    }
    const { line, column = 1 } = pickle.location ?? scenario.location;
    parent.children.push({
      name:
        pickle.name ||
        (isExample ? exampleName(feature?.language ?? "en") : scenario.keyword),
      line,
      column,
      tags: pickle.tags.map(({ name }) => name),
      ...(isExample && { isExample }),
    });
  }
  return root;
};

/** Every test of `tree`, in order (its scenarios', and its Outlines' rows'). */
export const testsOf = (tree: FeatureSuite): FeatureTest[] =>
  tree.children.flatMap((child) =>
    "children" in child ? testsOf(child) : [child],
  );

/** A test's place in its feature's tree: the test, and the names of the suites above it. */
export interface TestPlace {
  test: FeatureTest;
  /** Its rule's and its outline's names, as they are (the feature's left out). */
  suites: string[];
}

/** Each test of `tree` by its line (its pickle's), with its place in the tree. */
export const placesOf = (tree: FeatureSuite): Map<number, TestPlace> => {
  const places = new Map<number, TestPlace>();
  const walk = (parent: FeatureSuite, suites: string[]) => {
    for (const child of parent.children) {
      if ("children" in child) {
        walk(child, [...suites, child.name]);
      } else {
        places.set(child.line, { test: child, suites });
      }
    }
  };
  walk(tree, []);
  return places;
};
