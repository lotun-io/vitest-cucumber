// A feature's title in Storybook's index: its stories file's (the one written in it, else
// Storybook's automatic one), then the feature's label. Each case a Storybook project of its own
// (its `stories`, its files), indexed by the preset's indexer with Storybook's own title function
// (`getStoryTitle`: what Storybook makes of a file's written title, its pattern's `titlePrefix`
// in front), and compared with the title Storybook gives the stories file itself.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getStoryTitle } from "storybook/internal/common";
import type { StoriesEntry } from "storybook/internal/types";
import { afterAll, describe, expect, test, vi } from "vitest";
import { experimental_indexers } from "../preset.ts";
import type { PresetOptions } from "../preset/project.ts";

const projects: string[] = [];
afterAll(() => {
  for (const project of projects) {
    rmSync(project, { recursive: true, force: true });
  }
});

const steps = [
  `Given("the {storybook:story} story", (story) => {});`,
  `Given("the stories of {storybook:storiesFile}", (file) => {});`,
].join("\n");

/** A stories file's text: its meta (with `title`, if any) and its story `Plain`. */
const storiesFile = (title?: string) =>
  `export default {${title === undefined ? "" : ` title: ${JSON.stringify(title)} `}};\nexport const Plain = {};\n`;

/** A feature named `name` on stories file `stories`, its scenario "Plain" on the story `Plain`. */
const feature = (name: string, stories: string) =>
  [
    `Feature: ${name}`,
    "  Background:",
    `    Given the stories of "${stories}"`,
    "  Scenario: Plain",
    '    Given the "Plain" story',
    "",
  ].join("\n");

/** Storybook's `stories` of most cases: the stories files of `src/`, the features of both folders in one pattern. */
const stories: StoriesEntry[] = [
  "../src/**/*.stories.ts",
  "../@(src|features)/**/*.@(feature|feature.md)",
];

/**
 * A Storybook project of `files` (paths from its folder) with `entries` as its `stories`: what
 * Storybook's index has of a feature file, and the title Storybook gives any of its files.
 */
const storybookProject = (
  entries: StoriesEntry[],
  files: Record<string, string>,
) => {
  const project = mkdtempSync(path.join(tmpdir(), "titles-"));
  projects.push(project);
  for (const [name, content] of Object.entries({
    "steps/stories.ts": steps,
    ...files,
  })) {
    mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
    writeFileSync(path.join(project, name), content);
  }
  const configDir = path.join(project, ".storybook");
  const options = {
    configDir,
    presets: {
      apply: (name: string) =>
        Promise.resolve(name === "stories" ? entries : undefined),
    },
    vitestCucumber: { import: ["steps/*.ts"] },
  } as unknown as PresetOptions;
  /** Storybook's title of `file`, `written` in it or not; none: no `stories` pattern matches it. */
  const titleOf = (file: string, written?: string) =>
    getStoryTitle({
      storyFilePath: path.join(project, file),
      configDir,
      stories: entries,
      ...(written !== undefined && { userTitle: written }),
    });
  return {
    titleOf,
    /** Feature file `file`'s index entries (their titles and ids), as Storybook's own process indexes it. */
    indexOf: async (file: string) => {
      // Not the addon's Vitest run: a feature that can't be linked stops the index.
      vi.stubEnv("VITEST", "");
      try {
        const [indexer] = await experimental_indexers([], options);
        const entries = await indexer?.createIndex(path.join(project, file), {
          makeTitle: (written) => titleOf(file, written) ?? "",
        });
        return entries?.map(({ title, __id }) => ({ title, id: __id }));
      } finally {
        vi.unstubAllEnvs();
      }
    },
  };
};

describe("a stories file that writes its title", () => {
  test("the feature next to it: its title, then the feature's label, then the scenario's own (its place in the tree)", async () => {
    const { indexOf, titleOf } = storybookProject(stories, {
      "src/Button.stories.ts": storiesFile("Example/Button"),
      "src/Button.feature": feature("Button", "./Button.stories.ts"),
    });
    expect(titleOf("src/Button.stories.ts", "Example/Button")).toBe(
      "Example/Button",
    );
    expect(await indexOf("src/Button.feature")).toEqual([
      {
        title: "Example/Button/Feature: Button",
        id: "example-button-feature-button--vitest-cucumber-feature",
      },
      {
        title: "Example/Button/Feature: Button/Plain",
        id: "example-button-feature-button--plain",
      },
    ]);
  });

  test("one no `stories` pattern matches: its title as written", async () => {
    const { indexOf, titleOf } = storybookProject(stories, {
      "elsewhere/Kept.stories.ts": storiesFile("Kept/As written"),
      "features/kept.feature": feature("Kept", "elsewhere/Kept.stories.ts"),
    });
    // Storybook doesn't list the stories file.
    expect(
      titleOf("elsewhere/Kept.stories.ts", "Kept/As written"),
    ).toBeUndefined();
    expect(await indexOf("features/kept.feature")).toEqual([
      {
        title: "Kept/As written/Feature: Kept",
        id: "kept-as-written-feature-kept--vitest-cucumber-feature",
      },
      {
        title: "Kept/As written/Feature: Kept/Plain",
        id: "kept-as-written-feature-kept--plain",
      },
    ]);
  });
});

describe("a stories file that writes no title: Storybook's automatic one", () => {
  const files = {
    "src/parts/Card.stories.ts": storiesFile(),
    "src/parts/Card.feature": feature("Card", "./Card.stories.ts"),
    "src/parts/Card.feature.md": [
      "# Feature: Card in Markdown",
      "",
      "## Background:",
      '* Given the stories of "./Card.stories.ts"',
      "",
      "## Scenario: Plain",
      '* Given the "Plain" story',
      "",
    ].join("\n"),
    "features/away/Away.feature": feature("Away", "src/parts/Card.stories.ts"),
  };
  /** What each feature of `files` is listed as, under the stories file's `parts/Card`. */
  const listed = {
    sibling: [
      {
        title: "parts/Card/Feature: Card",
        id: "parts-card-feature-card--vitest-cucumber-feature",
      },
      {
        title: "parts/Card/Feature: Card/Plain",
        // Not its stories file's story of the same name (`parts-card--plain`).
        id: "parts-card-feature-card--plain",
      },
    ],
    markdown: [
      {
        title: "parts/Card/Feature: Card in Markdown",
        id: "parts-card-feature-card-in-markdown--vitest-cucumber-feature",
      },
      {
        title: "parts/Card/Feature: Card in Markdown/Plain",
        id: "parts-card-feature-card-in-markdown--plain",
      },
    ],
    away: [
      {
        title: "parts/Card/Feature: Away",
        id: "parts-card-feature-away--vitest-cucumber-feature",
      },
      {
        title: "parts/Card/Feature: Away/Plain",
        id: "parts-card-feature-away--plain",
      },
    ],
  };

  test("the feature next to it (a scenario named as its story), the Markdown one, and one of another folder naming it: all under the stories file's title", async () => {
    const { indexOf, titleOf } = storybookProject(stories, files);
    expect(titleOf("src/parts/Card.stories.ts")).toBe("parts/Card");
    expect(await indexOf("src/parts/Card.feature")).toEqual(listed.sibling);
    expect(await indexOf("src/parts/Card.feature.md")).toEqual(listed.markdown);
    expect(await indexOf("features/away/Away.feature")).toEqual(listed.away);
  });

  test("whatever pattern lists the feature files: one for both folders, or one each", async () => {
    const { indexOf } = storybookProject(
      [
        "../src/**/*.stories.ts",
        "../src/**/*.@(feature|feature.md)",
        "../features/**/*.@(feature|feature.md)",
      ],
      files,
    );
    expect(await indexOf("src/parts/Card.feature")).toEqual(listed.sibling);
    expect(await indexOf("src/parts/Card.feature.md")).toEqual(listed.markdown);
    expect(await indexOf("features/away/Away.feature")).toEqual(listed.away);
  });

  test("one no `stories` pattern matches: no title to take, the feature's error", async () => {
    const { indexOf } = storybookProject(stories, {
      "elsewhere/Unlisted.stories.ts": storiesFile(),
      "features/unlisted.feature": feature(
        "Unlisted",
        "elsewhere/Unlisted.stories.ts",
      ),
    });
    await expect(indexOf("features/unlisted.feature")).rejects.toThrow(
      '  - elsewhere/Unlisted.stories.ts has no title: none is written in its meta, and no pattern of Storybook\'s "stories" matches it (give its meta a "title", or list the file in "stories")\n    features/unlisted.feature:3',
    );
  });
});

describe("a `titlePrefix` on Storybook's `stories`", () => {
  const files = {
    "src/Button.stories.ts": storiesFile("Example/Button"),
    "src/Button.feature": feature("Button", "./Button.stories.ts"),
    "src/parts/Card.stories.ts": storiesFile(),
    "src/parts/Card.feature": feature("Card", "./Card.stories.ts"),
  };
  const prefixed = (pattern: string): StoriesEntry => ({
    directory: "../src",
    files: pattern,
    titlePrefix: "App",
  });

  test("on the stories files' pattern and the features': the prefix once, each feature under its stories file", async () => {
    const { indexOf, titleOf } = storybookProject(
      [prefixed("**/*.stories.ts"), prefixed("**/*.feature")],
      files,
    );
    expect(titleOf("src/Button.stories.ts", "Example/Button")).toBe(
      "App/Example/Button",
    );
    expect(await indexOf("src/Button.feature")).toEqual([
      {
        title: "App/Example/Button/Feature: Button",
        id: "example-button-feature-button--vitest-cucumber-feature",
      },
      {
        title: "App/Example/Button/Feature: Button/Plain",
        // Its id the meta's (the module's title, without the prefix Storybook adds to the entry's).
        id: "example-button-feature-button--plain",
      },
    ]);
    expect(titleOf("src/parts/Card.stories.ts")).toBe("App/parts/Card");
    expect(await indexOf("src/parts/Card.feature")).toEqual([
      {
        title: "App/parts/Card/Feature: Card",
        id: "parts-card-feature-card--vitest-cucumber-feature",
      },
      {
        title: "App/parts/Card/Feature: Card/Plain",
        id: "parts-card-feature-card--plain",
      },
    ]);
  });

  test("on the stories files' pattern only: the features have none (Storybook prefixes a file by its own pattern), so they aren't under their stories files", async () => {
    const { indexOf, titleOf } = storybookProject(
      [prefixed("**/*.stories.ts"), "../src/**/*.feature"],
      files,
    );
    expect(titleOf("src/parts/Card.stories.ts")).toBe("App/parts/Card");
    expect(await indexOf("src/parts/Card.feature")).toEqual([
      {
        title: "parts/Card/Feature: Card",
        id: "parts-card-feature-card--vitest-cucumber-feature",
      },
      {
        title: "parts/Card/Feature: Card/Plain",
        id: "parts-card-feature-card--plain",
      },
    ]);
    expect(await indexOf("src/Button.feature")).toEqual([
      {
        title: "Example/Button/Feature: Button",
        id: "example-button-feature-button--vitest-cucumber-feature",
      },
      {
        title: "Example/Button/Feature: Button/Plain",
        id: "example-button-feature-button--plain",
      },
    ]);
  });
});
