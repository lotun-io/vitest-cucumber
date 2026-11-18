import { expect, test } from "vitest";
import { planOf } from "../../../feature/plan.ts";
import { featureLabelOf, featureStoriesOf } from "../featureStories.ts";

/** Feature file `uri`'s label, `lines` its Gherkin. */
const labelOf = (uri: string, lines: string[]) => {
  const { gherkin } = planOf(lines.join("\n"), uri, "en");
  if (!gherkin) {
    throw new Error("no Gherkin");
  }
  return featureLabelOf(gherkin.document, `/p/${uri}`);
};

test("a feature's label: its keyword and name, as written; no name, its file's base name; a `/` a `|`", () => {
  const scenario = ["  Scenario: a", "    Given a step"];
  expect(
    labelOf("src/Header.feature", ["Feature: Logging in", ...scenario]),
  ).toBe("Feature: Logging in");
  expect(labelOf("src/Header.feature", ["Feature:", ...scenario])).toBe(
    "Feature: Header",
  );
  expect(
    labelOf("src/Account.feature.md", [
      "# Feature:",
      "",
      "## Scenario: a",
      "* Given a step",
    ]),
  ).toBe("Feature: Account");
  expect(labelOf("src/Header.stories.feature", ["Feature:", ...scenario])).toBe(
    "Feature: Header.stories",
  );
  expect(
    labelOf("src/Header.feature", [
      "# language: de",
      "Funktionalität:",
      "  Szenario: a",
      "    Angenommen ein Schritt",
    ]),
  ).toBe("Funktionalität: Header");
  expect(
    labelOf("src/Header.feature", ["Feature: Log in/out", ...scenario]),
  ).toBe("Feature: Log in|out");
});

test("the meta is the stories file's (its parameters spread with it), nothing of the plugin's added", () => {
  const source = 'Feature: Login\n  Scenario: Log in\n    Given a "step"\n';
  const { gherkin } = planOf(source, "src/Login.feature", "en");
  if (!gherkin) {
    throw new Error("no Gherkin");
  }
  const { code } = featureStoriesOf({
    feature: "/p/src/Login.feature",
    document: gherkin.document,
    storiesFile: "/p/src/Login.stories.ts",
    stories: { exports: [], factories: false, metaTags: [], tags: {} },
    links: [],
    featureModule: "/p/feature",
  });
  expect(code).toContain(
    "  ...__cucumberFeature.metaOf(__cucumberStories.default),",
  );
  expect(code).not.toContain("parameters");
});
