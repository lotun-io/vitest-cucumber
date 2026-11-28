import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sanitize } from "storybook/internal/csf";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { planOf } from "../../../feature/plan.ts";
import { featureLinksOf } from "../featureLinks.ts";
import {
  type LinkedFeature,
  linkedFeatureOf,
  type SameLabel,
} from "../linkedFeature.ts";
import { storybookStepsOfFiles } from "../supportSteps.ts";

let root: string;

/** Writes `files` (paths from the root) under the root. */
const write = (files: Record<string, string>) => {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
};

const stepsFile = [
  `import { Given } from "@cucumber/cucumber";`,
  `Given("the {storybook:story} story", (story: string) => {});`,
  `Given("the unmounted {storybook:storyUnmounted} story", (story: string) => {});`,
  `Given("the stories of {storybook:storiesFile}", (file: string) => {});`,
].join("\n");

const buttonStories = [
  `export default { title: "Button" };`,
  "export const Primary = {};",
  "export const Secondary = {};",
].join("\n");

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "linked-feature-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** What stops a linked feature (none: it's linked). */
const errorsOf = (linked: LinkedFeature) =>
  "errors" in linked ? linked.errors : [];

/** A linked feature's link (one that's stopped: its errors thrown). */
const linkOf = (linked: LinkedFeature) => {
  if ("errors" in linked) {
    throw new Error(linked.errors.map(({ message }) => message).join("\n"));
  }
  return linked;
};

/**
 * Feature file `uri` (its content written), linked; `autoTitle`, Storybook's automatic title of
 * its stories file (none: no `stories` pattern matches it); `sameLabel`, the other features on
 * its stories file whose labels give its label's id (here "Its label").
 */
const linkedOf = async (
  uri: string,
  lines: string[],
  autoTitle?: string,
  sameLabel: SameLabel[] = [],
) => {
  write({ [uri]: lines.join("\n") });
  const { gherkin } = planOf(lines.join("\n"), uri, "en");
  if (!gherkin) {
    throw new Error("no Gherkin");
  }
  const steps = await storybookStepsOfFiles(
    [path.join(root, "steps/stories.ts")],
    root,
  );
  return linkedFeatureOf({
    uri,
    featureLine: gherkin.document.feature?.location.line ?? 1,
    root,
    linked: featureLinksOf({
      feature: path.join(root, uri),
      uri,
      root,
      steps,
      ...gherkin,
    }),
    stepErrors: steps.errors,
    label: "Its label",
    sameLabel,
    autoTitleOf: () => Promise.resolve(autoTitle),
    idOf: sanitize,
  });
};

describe("a feature file, linked to its stories file", () => {
  test("its stories file, its stories, the scenarios that run on them", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.stories.ts": buttonStories,
    });
    const linked = linkOf(
      await linkedOf("features/button.feature", [
        "Feature: Button",
        "  Background:",
        '    Given the stories of "src/Button.stories.ts"',
        "  Scenario: Secondary",
        '    Given the "Secondary" story',
        "  Scenario: Primary",
        '    Given the "Primary" story',
      ]),
    );
    expect(linked.storiesFile).toBe(path.join(root, "src/Button.stories.ts"));
    expect(linked.stories.exports).toEqual(["Primary", "Secondary"]);
    // The title written in the stories file, whatever Storybook's automatic one would be.
    expect(linked.title).toBe("Button");
    expect(
      linked.links.map(({ name, exportName }) => [name, exportName]),
    ).toEqual([
      ["Secondary", "Secondary"],
      ["Primary", "Primary"],
    ]);
  });

  test("a stories file that writes no title: Storybook's automatic one; none either (no `stories` pattern matches it): the feature's error, at its stories file step", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Card.stories.ts": "export default {};\nexport const Plain = {};\n",
    });
    const card = [
      "Feature: Card",
      "  Background:",
      '    Given the stories of "./Card.stories.ts"',
      "  Scenario: A",
      '    Given the "Plain" story',
    ];
    const listed = await linkedOf("src/Card.feature", card, "parts/Card");
    expect(linkOf(listed).title).toBe("parts/Card");
    const unlisted = await linkedOf("src/Card.feature", card);
    expect(errorsOf(unlisted)).toEqual([
      {
        message:
          'src/Card.stories.ts has no title, give its meta a "title" or match the file with a pattern in Storybook\'s "stories"',
        at: ["src/Card.feature:3"],
      },
    ]);
    const named = await linkedOf("features/card.feature", [
      "Feature: Card",
      "  Scenario: A",
      '    Given the stories of "src/Card.stories.ts"',
      '    Given the "Plan" story',
    ]);
    // Every error of its links, the title's among them.
    expect(errorsOf(named)).toEqual([
      {
        message:
          'src/Card.stories.ts has no title, give its meta a "title" or match the file with a pattern in Storybook\'s "stories"',
        at: ["features/card.feature:3"],
      },
      {
        message: 'src/Card.stories.ts has no story "Plan" (it has Plain)',
        at: ["features/card.feature:4"],
      },
    ]);
  });

  test("no stories file: its links' errors say why (none named, or one that doesn't exist)", async () => {
    write({
      "steps/stories.ts": stepsFile,
      // Next to it, but not named: not its stories file.
      "features/plain.stories.ts": buttonStories,
    });
    expect(
      await linkedOf("features/plain.feature", [
        "Feature: Plain",
        "  Scenario: A",
        '    Given the "Primary" story',
      ]),
    ).toEqual({
      errors: [
        {
          message:
            "the feature names no stories file, add a stories file step to its Background",
          at: ["features/plain.feature:1"],
        },
      ],
    });
    expect(
      await linkedOf("features/plain.feature", [
        "Feature: Plain",
        "  Scenario: A",
        '    Given the stories of "src/Gone.stories.ts"',
        '    And the "Primary" story',
      ]),
    ).toEqual({
      errors: [
        {
          message:
            'the stories file "src/Gone.stories.ts" doesn\'t exist (looked for src/Gone.stories.ts)',
          at: ["features/plain.feature:3"],
        },
      ],
    });
  });

  test("another feature on its stories file with its label: an error, after its links' own, the id named", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.stories.ts": buttonStories,
    });
    const others = [
      {
        file: path.join(root, "features/other.feature"),
        label: "Its label",
        line: 1,
      },
    ];
    expect(
      await linkedOf(
        "src/Button.feature",
        [
          "Feature: Button",
          "  Background:",
          '    Given the stories of "./Button.stories.ts"',
          "  Scenario: A",
          '    Given the "Primry" story',
        ],
        undefined,
        others,
      ),
    ).toEqual({
      errors: [
        {
          message:
            'src/Button.stories.ts has no story "Primry" (it has Primary, Secondary)',
          at: ["src/Button.feature:5"],
        },
        {
          message:
            'src/Button.stories.ts already has a feature named "Its label", rename one of them (story id "button-its-label")',
          at: ["features/other.feature:1", "src/Button.feature:1"],
        },
      ],
    });
  });

  test("another feature on its stories file whose label differs in case or punctuation only: an error, its label and the id named", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.stories.ts": buttonStories,
    });
    const others = [
      {
        file: path.join(root, "features/other.feature"),
        label: "its label!",
        line: 1,
      },
    ];
    expect(
      await linkedOf(
        "src/Button.feature",
        [
          "Feature: Button",
          "  Background:",
          '    Given the stories of "./Button.stories.ts"',
          "  Scenario: A",
          '    Given the "Primary" story',
        ],
        undefined,
        others,
      ),
    ).toEqual({
      errors: [
        {
          message: `src/Button.stories.ts already has a feature named "its label!", rename one of them (story id "button-its-label", Storybook's ids ignore case and punctuation)`,
          at: ["features/other.feature:1", "src/Button.feature:1"],
        },
      ],
    });
  });

  test("a story the stories file doesn't have: an error, its stories listed", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.stories.ts": buttonStories,
    });
    const linked = await linkedOf("src/Button.feature", [
      "Feature: Button",
      "  Background:",
      '    Given the stories of "./Button.stories.ts"',
      "  Scenario: Clicking",
      '    Given the "Primry" story',
      "  Scenario: Secondary",
      '    Given the "Secondary" story',
    ]);
    expect(errorsOf(linked)).toEqual([
      {
        message:
          'src/Button.stories.ts has no story "Primry" (it has Primary, Secondary)',
        at: ["src/Button.feature:5"],
      },
    ]);
  });

  test("two stories file steps in one feature file: an error", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.stories.ts": buttonStories,
      "src/Input.stories.ts": buttonStories,
    });
    const linked = await linkedOf("features/forms.feature", [
      "Feature: Forms",
      "  Rule: Button",
      "    Background:",
      '      Given the stories of "src/Button.stories.ts"',
      "    Scenario: A",
      '      Given the "Primary" story',
      "  Rule: Input",
      "    Background:",
      '      Given the stories of "src/Input.stories.ts"',
      "    Scenario: B",
      '      Given the "Primary" story',
    ]);
    expect(errorsOf(linked)).toEqual([
      {
        message:
          "the feature has 2 stories file steps, keep one, in its Background",
        at: ["features/forms.feature:4", "features/forms.feature:9"],
      },
    ]);
  });

  test("a stories file in CSF factories: an error", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.stories.ts": [
        `import preview from "../.storybook/preview";`,
        "const meta = preview.meta({});",
        "export const Primary = meta.story({});",
      ].join("\n"),
    });
    const linked = await linkedOf("src/Button.feature", [
      "Feature: Button",
      "  Background:",
      '    Given the stories of "./Button.stories.ts"',
      "  Scenario: A",
      '    Given the "Primary" story',
    ]);
    expect(errorsOf(linked)).toEqual([
      {
        message:
          "src/Button.stories.ts uses CSF factories, which the plugin doesn't support yet, write its stories in CSF 3",
        at: ["src/Button.feature:3"],
      },
    ]);
  });

  test("a stories file step naming a file that isn't one (a component, a folder): the feature's error, at the step", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Button.tsx": "export const Button = () => null;\n",
    });
    const component = errorsOf(
      await linkedOf("features/component.feature", [
        "Feature: Component",
        "  Scenario: A",
        '    Given the stories of "src/Button.tsx"',
        '    Given the "Primary" story',
      ]),
    );
    expect(component).toHaveLength(1);
    expect(component[0]?.message).toMatch(
      /^src\/Button\.tsx can't be read as a stories file \(CSF: missing default export src\/Button\.tsx .*\)$/,
    );
    expect(component[0]?.at).toEqual(["features/component.feature:3"]);
    // No path in full: the reader's own are written from the root.
    expect(component[0]?.message).not.toContain(root);
    const folder = errorsOf(
      await linkedOf("features/folder.feature", [
        "Feature: Folder",
        "  Scenario: A",
        '    Given the stories of "src"',
        '    And the "default" story',
      ]),
    );
    expect(folder).toHaveLength(1);
    expect(folder[0]?.message).toMatch(
      /^src can't be read as a stories file \(EISDIR.*\)$/,
    );
    expect(folder[0]?.at).toEqual(["features/folder.feature:3"]);
    expect(folder[0]?.message).not.toContain(root);
  });

  test("its stories file, broken (no default export): the feature's error", async () => {
    write({
      "steps/stories.ts": stepsFile,
      "src/Card.stories.ts": "export const Primary = {};\n",
    });
    const errors = errorsOf(
      await linkedOf("src/Card.feature", [
        "Feature: Card",
        "  Background:",
        '    Given the stories of "./Card.stories.ts"',
        "  Scenario: A",
        '    Given the "Primary" story',
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(
      /^src\/Card\.stories\.ts can't be read as a stories file \(CSF: missing default export .*\)$/,
    );
    expect(errors[0]?.at).toEqual(["src/Card.feature:3"]);
  });
});
