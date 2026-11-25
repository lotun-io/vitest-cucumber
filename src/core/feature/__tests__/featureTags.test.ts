import { describe, expect, it } from "vitest";
import type { FeatureSuite, FeatureTest } from "../../../types/feature.ts";
import { tagsOf } from "../featureTags.ts";
import { planOf } from "../plan.ts";

/** Every test of `tree`, in order (its scenarios', and its Outlines' rows'). */
const testsOf = (tree: FeatureSuite): FeatureTest[] =>
  tree.children.flatMap((child) =>
    "children" in child ? testsOf(child) : [child],
  );

/** The tags of the tests of the feature file's plan. */
const planTags = (content: string, uri: string) => [
  ...new Set(
    testsOf(planOf(content, uri, "en").featureTree).flatMap(({ tags }) => tags),
  ),
];

const gherkin = `
@feature
Feature: Tagged

  @scenario @two # a comment
  Scenario: One
    Given a step
      """
      @notATag
      """

  @rule
  Rule: A rule

    @outline
    Scenario Outline: Many
      Given a <thing>

      @examples
      Examples:
        | thing |
        | a     |
`;

const markdown = `
\`@feature\`
# Feature: Tagged

\`@scenario\` \`@two\`
## Scenario: One
* Given a step

\`@outline\`
## Scenario Outline: Many
* Given a <thing>

\`@examples\`
### Examples:

  | thing |
  | ----- |
  | a     |
`;

describe("tagsOf", () => {
  it("reads a feature file's tags at every level, as its plan's tests have them", () => {
    const tags = tagsOf(gherkin, "features/tagged.feature", "en");
    expect(tags.sort()).toEqual([
      "@examples",
      "@feature",
      "@outline",
      "@rule",
      "@scenario",
      "@two",
    ]);
    expect(tags).toEqual(planTags(gherkin, "features/tagged.feature").sort());
  });

  it("reads Gherkin in Markdown's tags, as its plan's tests have them", () => {
    const tags = tagsOf(markdown, "features/tagged.feature.md", "en");
    expect(tags.sort()).toEqual([
      "@examples",
      "@feature",
      "@outline",
      "@scenario",
      "@two",
    ]);
    expect(tags).toEqual(
      planTags(markdown, "features/tagged.feature.md").sort(),
    );
  });

  it("reads another language's", () => {
    expect(
      tagsOf(
        "# language: fr\n@un\nFonctionnalité: F\n  @deux\n  Scénario: S\n    Soit x\n",
        "f.feature",
        "en",
      ).sort(),
    ).toEqual(["@deux", "@un"]);
  });

  it("gives none for a file that doesn't parse", () => {
    expect(tagsOf("@tag\nNot Gherkin\n", "broken.feature", "en")).toEqual([]);
  });
});
