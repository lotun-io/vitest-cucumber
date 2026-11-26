import { sanitize } from "storybook/internal/csf";
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

/** Feature file `src/Login.feature` (its Gherkin `source`) as stories: every pickle a link, on no story. */
const storiesOf = (source: string) => {
  const { gherkin, featureTree } = planOf(source, "src/Login.feature", "en");
  if (!gherkin) {
    throw new Error("no Gherkin");
  }
  return featureStoriesOf({
    feature: "/p/src/Login.feature",
    document: gherkin.document,
    tree: featureTree,
    storiesFile: "/p/src/Login.stories.ts",
    storiesTitle: "Example/Login",
    stories: { exports: [], factories: false, metaTags: [], tags: {} },
    links: gherkin.pickles.map(({ name, location, tags }) => ({
      feature: "/p/src/Login.feature",
      line: location?.line ?? 0,
      name,
      tags: tags.map((tag) => tag.name),
      storiesFile: "/p/src/Login.stories.ts",
      unmounted: false,
    })),
    featureModule: "/p/feature",
    idOf: sanitize,
  });
};

test("the meta is the stories file's (its parameters spread with it), its id and title the feature's, nothing else of the plugin's added", () => {
  const { code } = storiesOf("Feature: Login\n");
  expect(code).toContain(
    "  ...__cucumberFeature.metaOf(__cucumberStories.default),",
  );
  expect(code).toContain('  id: "example-login-feature-login",');
  expect(code).toContain('  title: "Example/Login/Feature: Login",');
  expect(code).not.toContain("parameters");
});

test("a scenario's story's tags: its Gherkin tags, Storybook's own among them without the `@` (a feature's before its own), then what a scenario's story never has", () => {
  const { code } = storiesOf(`@!dev @smoke
Feature: Login

  Scenario: Hidden
    Given a step

  @dev @!test
  Scenario: Shown, not tested
    Given a step
`);
  expect(code).toContain('  tags: ["!dev","@smoke","!autodocs","!manifest"],');
  expect(code).toContain(
    '  tags: ["!dev","@smoke","dev","!test","!autodocs","!manifest"],',
  );
});

test("each story's title its place in Vitest's tree, its name its test's (a scenario's the same text as its title's last part)", () => {
  const { scenarios, titles } = storiesOf(`Feature: Login

  Scenario: Log in/out
    Given a step

  Rule: Logged in

    Scenario: Log out
      Given a step

    Scenario Outline: Log out after <button>
      Given a step

      Examples:
        | button |
        | Save   |

  Rule:

    Scenario Outline:
      Given a step

      Examples:
        | n |
        | 1 |
`);
  expect(
    scenarios.map(({ export: exportName, name, title }) => [
      exportName,
      name,
      title,
    ]),
  ).toEqual([
    ["LogInOut", "Log in|out", "Example/Login/Feature: Login/Log in|out"],
    ["LogOut", "Log out", "Example/Login/Feature: Login/Logged in/Log out"],
    [
      "LogOutAfterSave",
      "Log out after Save",
      "Example/Login/Feature: Login/Logged in/Log out after <button>",
    ],
    [
      "Scenario",
      "Example",
      "Example/Login/Feature: Login/Rule/Scenario Outline",
    ],
  ]);
  // The feature's own story too: its title the feature's.
  expect(titles).toEqual({
    __vitestCucumberFeature: "Example/Login/Feature: Login",
    ...Object.fromEntries(
      scenarios.map(({ export: exportName, title }) => [exportName, title]),
    ),
  });
});
