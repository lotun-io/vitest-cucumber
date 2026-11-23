import { describe, expect, test } from "vitest";
import type { FeatureSuite } from "../../../types/feature.ts";
import { placesOf } from "../featureTree.ts";
import { planOf } from "../plan.ts";

/** The tree as names: a suite `[name, children]`, a test its name (an example's with `*`). */
const namesOf = (suite: FeatureSuite): unknown[] => [
  suite.name,
  suite.children.map((child) =>
    "children" in child
      ? namesOf(child)
      : `${child.name}${child.isExample ? " *" : ""}`,
  ),
];

const treeOf = (content: string) =>
  planOf(content, "features/a.feature", "en").featureTree;

describe("featureTree", () => {
  test("named: a suite per feature, rule and outline, a test per scenario and example", () => {
    expect(
      namesOf(
        treeOf(`Feature: Login

  Scenario: Log in
    Given a step

  Rule: Logged in

    Scenario Outline: Log out after <button>
      Given a step

      Examples:
        | button |
        | Save   |
        | Cancel |
`),
      ),
    ).toEqual([
      "Login",
      [
        "Log in",
        [
          "Logged in",
          [
            [
              "Log out after <button>",
              ["Log out after Save *", "Log out after Cancel *"],
            ],
          ],
        ],
      ],
    ]);
  });

  test('empty names: no feature suite (`""`), keywords as written, `Example` for an example', () => {
    expect(
      namesOf(
        treeOf(`Feature:

  Scenario:
    Given a step

  Example:
    Given a step

  Scenario Outline:
    Given a step

    Examples:
      | n |
      | 1 |
      | 2 |

  Rule:

    Scenario Template:
      Given a step

      Examples:
        | n |
        | 1 |
`),
      ),
    ).toEqual([
      "",
      [
        "Scenario",
        "Example",
        ["Scenario Outline", ["Example *", "Example *"]],
        ["Rule", [["Scenario Template", ["Example *"]]]],
      ],
    ]);
  });

  test("an example whose name has a placeholder keeps its pickle's name; one without, its outline's", () => {
    expect(
      namesOf(
        treeOf(`Feature: A

  Scenario Outline: Same
    Given a step <n>

    Examples:
      | n |
      | 1 |
`),
      ),
    ).toEqual(["A", [["Same", ["Same *"]]]]);
  });

  test("another language: its keywords, its `Example` keyword for an example", () => {
    expect(
      namesOf(
        planOf(
          `# language: fr
Fonctionnalité:

  Règle:

    Scénario:
      Soit une étape

    Plan du scénario:
      Soit une étape

      Exemples:
        | n |
        | 1 |
`,
          "features/a.feature",
          "en",
        ).featureTree,
      ),
    ).toEqual([
      "",
      [["Règle", ["Scénario", ["Plan du scénario", ["Exemple *"]]]]],
    ]);
  });

  test("the plugin's language for a file without its own", () => {
    expect(
      namesOf(
        planOf(
          `Funktionalität:

  Szenariogrundriss:
    Angenommen ein Schritt

    Beispiele:
      | n |
      | 1 |
`,
          "features/a.feature",
          "de",
        ).featureTree,
      ),
    ).toEqual(["", [["Szenariogrundriss", ["Beispiel *"]]]]);
  });
});

describe("placesOf", () => {
  test("each test by its line: its rule's and outline's names", () => {
    const places = placesOf(
      treeOf(`Feature: Login

  Scenario: Log in
    Given a step

  Rule: Logged in

    Scenario: Log out
      Given a step

    Scenario Outline:
      Given a step

      Examples:
        | n |
        | 1 |
`),
    );
    expect(
      [...places].map(
        ([
          line,
          {
            test: { name, isExample },
            suites,
          },
        ]) => [line, name, isExample ?? false, suites],
      ),
    ).toEqual([
      [3, "Log in", false, []],
      [8, "Log out", false, ["Logged in"]],
      [16, "Example", true, ["Logged in", "Scenario Outline"]],
    ]);
  });
});
