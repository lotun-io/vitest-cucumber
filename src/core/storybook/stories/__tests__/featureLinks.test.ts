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
  test("next to its stories file: each scenario's story, unmounted or not; an Outline row's each", () => {
    const { storiesFile, links, errors } = linksOf("src/Button.feature", [
      "Feature: Button",
      "  Scenario: Clicking",
      "    Given the Primary story",
      "  Scenario: Mounting",
      "    Given the unmounted Primary story",
      "  @smoke",
      "  Scenario Outline: Kinds",
      "    Given the <story> story",
      "    Examples:",
      "      | story     |",
      "      | Primary   |",
      "      | Secondary |",
    ]);
    expect(errors).toEqual([]);
    const feature = path.join(root, "src/Button.feature");
    expect(storiesFile).toBe(path.join(root, "src/Button.stories.tsx"));
    const link = { feature, storiesFile, unmounted: false };
    expect(links).toEqual([
      {
        ...link,
        line: 2,
        name: "Clicking",
        tags: [],
        exportName: "Primary",
        storyLine: 3,
      },
      {
        ...link,
        line: 4,
        name: "Mounting",
        tags: [],
        exportName: "Primary",
        unmounted: true,
        storyLine: 5,
      },
      {
        ...link,
        line: 11,
        name: "Kinds",
        tags: ["@smoke"],
        exportName: "Primary",
        storyLine: 8,
      },
      {
        ...link,
        line: 12,
        name: "Kinds",
        tags: ["@smoke"],
        exportName: "Secondary",
        storyLine: 8,
      },
    ]);
  });

  test("elsewhere: the stories file its Background names, from the root or the feature's folder", () => {
    const button = linksOf("features/button.feature", [
      "Feature: Button",
      "  Background:",
      "    Given the stories of src/Button.stories.tsx",
      "  Scenario: Clicking",
      "    Given the Primary story",
    ]);
    expect(button.errors).toEqual([]);
    expect(button.storiesFile).toBe(path.join(root, "src/Button.stories.tsx"));
    expect(button.links).toMatchObject([{ line: 4, exportName: "Primary" }]);
    const input = linksOf("features/input.feature", [
      "Feature: Input",
      "  Scenario: Typing",
      "    Given the stories of ../src/Input.stories.ts",
      "    And the Filled story",
    ]);
    expect(input.errors).toEqual([]);
    expect(input.storiesFile).toBe(path.join(root, "src/Input.stories.ts"));
  });

  test("the feature's stories file, also for a scenario its stories file step doesn't reach", () => {
    const { links, errors } = linksOf("features/button.feature", [
      "Feature: Button",
      "  Scenario: Named",
      "    Given the stories of src/Button.stories.tsx",
      "    And the Primary story",
      "  Scenario: Not named",
      "    Given the Secondary story",
    ]);
    expect(errors).toEqual([]);
    expect(links).toMatchObject([
      { line: 2, storiesFile: path.join(root, "src/Button.stories.tsx") },
      { line: 5, storiesFile: path.join(root, "src/Button.stories.tsx") },
    ]);
  });

  test("named as its stories file (`.stories.feature`, `.stories.feature.md`): not next to it, a stories file step names it", () => {
    for (const uri of [
      "src/Button.stories.feature",
      "src/Button.stories.feature.md",
    ]) {
      expect(
        linksOf(uri, ["Feature: Button", "  Scenario: Plain"]).storiesFile,
      ).toBeUndefined();
    }
  });

  test("no stories file next to it and no stories file step: not a Storybook feature", () => {
    expect(
      linksOf("features/plain.feature", [
        "Feature: Plain",
        "  Scenario: A",
        "    When I click",
      ]),
    ).toEqual({ links: [], errors: [] });
  });

  test("no Storybook step: the meta; also a scenario without steps (no Background steps), the feature's stories file", () => {
    const { links, errors } = linksOf("features/button.feature", [
      "Feature: Button",
      "  Background:",
      "    Given the stories of src/Button.stories.tsx",
      "  Scenario: No story",
      "    When I click",
      "  Scenario: No steps",
    ]);
    expect(errors).toEqual([]);
    const link = {
      feature: path.join(root, "features/button.feature"),
      tags: [],
      storiesFile: path.join(root, "src/Button.stories.tsx"),
      unmounted: false,
    };
    expect(links).toEqual([
      { ...link, line: 4, name: "No story" },
      { ...link, line: 6, name: "No steps" },
    ]);
  });

  test("the story `default`: the meta, mounted or not (an Outline's rows on stories and on the meta)", () => {
    const { links, errors } = linksOf("src/Button.feature", [
      "Feature: Button",
      "  Scenario Outline: Sizes",
      "    Given the <story> story",
      "    Examples:",
      "      | story   |",
      "      | Small   |",
      "      | default |",
      "  Scenario: Mounting",
      "    Given the unmounted default story",
    ]);
    expect(errors).toEqual([]);
    const link = {
      feature: path.join(root, "src/Button.feature"),
      tags: [],
      storiesFile: path.join(root, "src/Button.stories.tsx"),
    };
    expect(links).toEqual([
      {
        ...link,
        line: 6,
        name: "Sizes",
        unmounted: false,
        exportName: "Small",
        storyLine: 3,
      },
      { ...link, line: 7, name: "Sizes", unmounted: false },
      { ...link, line: 8, name: "Mounting", unmounted: true },
    ]);
  });

  test("the errors of a scenario: two stories, a story without a stories file", () => {
    expect(
      linksOf("src/Button.feature", [
        "Feature: Button",
        "  Scenario: Two stories",
        "    Given the Primary story",
        "    And the Secondary story",
      ]).errors,
    ).toEqual([
      'src/Button.feature:2 ("Two stories") names a story twice (lines 3 and 4): a scenario has one, its Backgrounds\' steps included',
    ]);
    expect(
      linksOf("features/lonely.feature", [
        "Feature: Lonely",
        "  Scenario: A",
        "    Given the Primary story",
      ]).errors,
    ).toEqual([
      'features/lonely.feature:2 ("A") names the story "Primary" (line 3), but has no stories file: none is next to the feature file, add a stories file step',
    ]);
  });

  test("the errors of a stories file: missing, a leading /, twice in a scenario, two in a feature", () => {
    const at = (lines: string[]) =>
      linksOf("features/files.feature", lines).errors;
    expect(
      at([
        "Feature: Files",
        "  Scenario: Missing",
        "    Given the stories of src/Missing.stories.ts",
        "  Scenario: Absolute",
        "    Given the stories of /src/Button.stories.tsx",
        "  Scenario: Twice",
        "    Given the stories of src/Button.stories.tsx",
        "    And the stories of src/Input.stories.ts",
      ]),
    ).toEqual([
      `features/files.feature:3: the stories file "src/Missing.stories.ts" doesn't exist (${path.join(root, "src/Missing.stories.ts")}, from the project's root)`,
      'features/files.feature:5: the stories file "/src/Button.stories.tsx" starts with "/": write it from the project\'s root, or from the feature file\'s folder with "./" or "../"',
      'features/files.feature:6 ("Twice") names a stories file twice (lines 7 and 8): a scenario has one, its Backgrounds\' steps included',
    ]);
    expect(
      at([
        "Feature: Files",
        "  Rule: Button",
        "    Background:",
        "      Given the stories of src/Button.stories.tsx",
        "    Scenario: A",
        "      Given the Primary story",
        "  Rule: Input",
        "    Background:",
        "      Given the stories of src/Input.stories.ts",
        "    Scenario: B",
        "      Given the Filled story",
      ]),
    ).toEqual([
      "features/files.feature names 2 stories files (src/Button.stories.tsx: line 4; src/Input.stories.ts: line 9): a feature file runs on one stories file, split it into one per stories file",
    ]);
  });
});
