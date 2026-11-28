import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { planOf } from "../../../feature/plan.ts";
import { featureLinksOf } from "../featureLinks.ts";
import { scanSupportCode, storybookStepsOf } from "../storybookSteps.ts";

const steps = storybookStepsOf([
  scanSupportCode(
    [
      `import { Given } from "@cucumber/cucumber";`,
      `Given("the {storybook:story} story", (story: string) => {});`,
      `Given("the unmounted {storybook:storyUnmounted} story", (story: string) => {});`,
      `Given("the stories of {storybook:storiesFile}", (file: string) => {});`,
    ].join("\n"),
    "/steps.ts",
  ),
]);

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "feature-links-"));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, "features"));
  writeFileSync(path.join(root, "src/Button.stories.tsx"), "");
  writeFileSync(path.join(root, "src/Input.stories.ts"), "");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The links of feature file `uri` (from the root), `lines` its Gherkin. */
const linksOf = (uri: string, lines: string[]) => {
  const content = lines.join("\n");
  const feature = path.join(root, uri);
  const { gherkin } = planOf(content, uri, "en");
  if (!gherkin) {
    throw new Error("no Gherkin");
  }
  return featureLinksOf({ feature, uri, root, steps, ...gherkin });
};

describe("a feature's scenarios, linked to stories", () => {
  test("its Background names its stories file: each scenario's story, unmounted or not; an Outline row's each", () => {
    const { named, storiesFile, storiesLine, links, errors } = linksOf(
      "src/Button.feature",
      [
        "Feature: Button",
        "  Background:",
        '    Given the stories of "./Button.stories.tsx"',
        "  Scenario: Clicking",
        '    Given the "Primary" story',
        "  Scenario: Mounting",
        '    Given the unmounted "Primary" story',
        "  @smoke",
        "  Scenario Outline: Kinds",
        '    Given the "<story>" story',
        "    Examples:",
        "      | story     |",
        "      | Primary   |",
        "      | Secondary |",
      ],
    );
    expect(errors).toEqual([]);
    expect(storiesFile).toBe(path.join(root, "src/Button.stories.tsx"));
    expect(named).toBe(storiesFile);
    expect(storiesLine).toBe(3);
    const link = { unmounted: false };
    expect(links).toEqual([
      {
        ...link,
        line: 4,
        name: "Clicking",
        tags: [],
        exportName: "Primary",
        storyLine: 5,
      },
      {
        ...link,
        line: 6,
        name: "Mounting",
        tags: [],
        exportName: "Primary",
        unmounted: true,
        storyLine: 7,
      },
      {
        ...link,
        line: 13,
        name: "Kinds",
        tags: ["@smoke"],
        exportName: "Primary",
        storyLine: 10,
      },
      {
        ...link,
        line: 14,
        name: "Kinds",
        tags: ["@smoke"],
        exportName: "Secondary",
        storyLine: 10,
      },
    ]);
  });

  test("from the root or the feature's folder; the story in the Background too, each scenario on it", () => {
    const button = linksOf("features/button.feature", [
      "Feature: Button",
      "  Background:",
      '    Given the stories of "src/Button.stories.tsx"',
      '    And the "Primary" story',
      "  Scenario: Clicking",
      "    When I click",
      "  Scenario: Hovering",
      "    When I hover",
    ]);
    expect(button.errors).toEqual([]);
    expect(button.storiesFile).toBe(path.join(root, "src/Button.stories.tsx"));
    expect(button.links).toMatchObject([
      { line: 5, exportName: "Primary", storyLine: 4 },
      { line: 7, exportName: "Primary", storyLine: 4 },
    ]);
    const input = linksOf("features/input.feature", [
      "Feature: Input",
      "  Scenario: Typing",
      '    Given the stories of "../src/Input.stories.ts"',
      '    And the "Filled" story',
    ]);
    expect(input.errors).toEqual([]);
    expect(input.storiesFile).toBe(path.join(root, "src/Input.stories.ts"));
  });

  test("the story `default`: the meta, mounted or not (an Outline's rows on stories and on the meta)", () => {
    const { links, errors } = linksOf("src/Button.feature", [
      "Feature: Button",
      "  Background:",
      '    Given the stories of "./Button.stories.tsx"',
      "  Scenario Outline: Sizes",
      '    Given the "<story>" story',
      "    Examples:",
      "      | story   |",
      "      | Small   |",
      "      | default |",
      "  Scenario: Mounting",
      '    Given the unmounted "default" story',
    ]);
    expect(errors).toEqual([]);
    const link = { tags: [] };
    expect(links).toEqual([
      {
        ...link,
        line: 8,
        name: "Sizes",
        unmounted: false,
        exportName: "Small",
        storyLine: 5,
      },
      { ...link, line: 9, name: "Sizes", unmounted: false, storyLine: 5 },
      { ...link, line: 10, name: "Mounting", unmounted: true, storyLine: 11 },
    ]);
  });

  test("no Storybook step at all: the feature names no stories file; no scenario, a Background naming one or not: the feature has none", () => {
    expect(
      linksOf("src/Button.feature", [
        "Feature: Button",
        "  Scenario: A",
        "    When I click",
      ]),
    ).toEqual({
      named: undefined,
      storiesFile: undefined,
      storiesLine: undefined,
      links: [],
      errors: [
        {
          message:
            'the scenario "A" names no story, add a story step (a story of the stories file, or "default" for its meta)',
          at: ["src/Button.feature:2"],
        },
        {
          message:
            "the feature names no stories file, add a stories file step to its Background",
          at: ["src/Button.feature:1"],
        },
      ],
    });
    const none = {
      message:
        "the feature has no scenarios, add one (each scenario is a story)",
      at: ["src/Button.feature:1"],
    };
    expect(linksOf("src/Button.feature", ["Feature: Button"]).errors).toEqual([
      none,
    ]);
    expect(
      linksOf("src/Button.feature", [
        "Feature: Button",
        "  Background:",
        '    Given the stories of "./Button.stories.tsx"',
      ]).errors,
    ).toEqual([none]);
  });

  test("the errors of a scenario: no story, two stories, no steps (no Background steps), out of its feature's stories file step's reach", () => {
    expect(
      linksOf("src/Button.feature", [
        "Feature: Button",
        "  Background:",
        '    Given the stories of "./Button.stories.tsx"',
        "  Scenario: No story",
        "    When I click",
        "  Scenario: Two stories",
        '    Given the "Primary" story',
        '    And the "Secondary" story',
        "  Scenario: No steps",
      ]).errors,
    ).toEqual([
      {
        message:
          'the scenario "Two stories" names 2 stories, keep one story step (the Background\'s steps count too)',
        at: [
          "src/Button.feature:7",
          "src/Button.feature:8",
          "src/Button.feature:6",
        ],
      },
      {
        message:
          'the scenario "No story" names no story, add a story step (a story of the stories file, or "default" for its meta)',
        at: ["src/Button.feature:4"],
      },
      {
        message:
          'the scenario "No steps" has no steps, give it a story step (a Background\'s steps only reach a scenario with steps)',
        at: ["src/Button.feature:9"],
      },
    ]);
    expect(
      linksOf("src/Button.feature", [
        "Feature: Button",
        "  Scenario: Named",
        '    Given the stories of "./Button.stories.tsx"',
        '    And the "Primary" story',
        "  Scenario: Not reached",
        '    Given the "Secondary" story',
        "  Scenario: Neither",
        "    When I click",
      ]).errors,
    ).toEqual([
      {
        message:
          'the scenario "Not reached" names no stories file, move the stories file step to the feature\'s Background',
        at: ["src/Button.feature:5"],
      },
      {
        message:
          'the scenario "Neither" names no stories file and no story, move the stories file step to the feature\'s Background and add a story step',
        at: ["src/Button.feature:7"],
      },
    ]);
  });

  test("the errors of its stories file: missing (still named), a leading /, two steps, one Outline step naming two", () => {
    const at = (lines: string[]) => linksOf("features/files.feature", lines);
    const missing = at([
      "Feature: Files",
      "  Background:",
      '    Given the stories of "src/Missing.stories.ts"',
      "  Scenario: A",
      '    Given the "Primary" story',
    ]);
    expect(missing.errors).toEqual([
      {
        message:
          'the stories file "src/Missing.stories.ts" doesn\'t exist (looked for src/Missing.stories.ts)',
        at: ["features/files.feature:3"],
      },
    ]);
    // Still named: the feature is linked to it, so its event (added) concerns the feature.
    expect(missing).toMatchObject({
      named: path.join(root, "src/Missing.stories.ts"),
      storiesFile: undefined,
      links: [],
    });
    expect(
      at([
        "Feature: Files",
        "  Background:",
        '    Given the stories of "/src/Button.stories.tsx"',
        "  Scenario: A",
        '    Given the "Primary" story',
      ]).errors,
    ).toEqual([
      {
        message:
          'the stories file "/src/Button.stories.tsx" starts with "/", drop the "/" to start from the project\'s root, or start it with "./" or "../" from the feature\'s folder',
        at: ["features/files.feature:3"],
      },
    ]);
    expect(
      at([
        "Feature: Files",
        "  Rule: Button",
        "    Background:",
        '      Given the stories of "src/Button.stories.tsx"',
        "    Scenario: A",
        '      Given the "Primary" story',
        "  Rule: Input",
        "    Background:",
        '      Given the stories of "src/Button.stories.tsx"',
        "    Scenario: B",
        '      Given the "Filled" story',
      ]).errors,
    ).toEqual([
      {
        message:
          "the feature has 2 stories file steps, keep one, in its Background",
        at: ["features/files.feature:4", "features/files.feature:9"],
      },
    ]);
    expect(
      at([
        "Feature: Files",
        "  Scenario Outline: Each",
        '    Given the stories of "<file>"',
        '    And the "Primary" story',
        "    Examples:",
        "      | file                   |",
        "      | src/Button.stories.tsx |",
        "      | src/Input.stories.ts   |",
      ]).errors,
    ).toEqual([
      {
        message:
          "the stories file step names 2 stories files (src/Button.stories.tsx, src/Input.stories.ts), split the feature into one per stories file",
        at: ["features/files.feature:3"],
      },
    ]);
  });
});
