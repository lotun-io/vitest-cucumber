import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import type { PresetOptions } from "../storybook/preset/project.ts";
import { createStorybookPlugin } from "../storybookPlugin.ts";

/** A Storybook project: steps, a stories file without a title, the feature next to it. */
const project = mkdtempSync(path.join(tmpdir(), "storybook-plugin-"));
const write = (name: string, content: string) => {
  mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
  writeFileSync(path.join(project, name), content);
  return path.join(project, name);
};
write(
  "steps/stories.ts",
  `Given("the {storybook:story} story", (story) => {});\nGiven("the stories of {storybook:storiesFile}", (file) => {});`,
);
const storiesFile = write(
  "src/stories/Auto.stories.ts",
  "export default {};\nexport const Plain = {};\n",
);
const feature = write(
  "src/stories/Auto.feature",
  'Feature: Auto\n  Background:\n    Given the stories of "./Auto.stories.ts"\n  Scenario: Plain\n    Given the "Plain" story\n',
);
afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

/**
 * Storybook's options, as the preset's functions get them: its config folder, its presets (its
 * `stories`), the addon entry's options (the plugin's: its support files).
 */
const options = {
  configDir: path.join(project, ".storybook"),
  presets: {
    apply: () =>
      Promise.resolve(["../src/**/*.stories.ts", "../src/**/*.feature"]),
  },
  vitestCucumber: { import: ["steps/*.ts"] },
} as unknown as PresetOptions;

/** A plugin as these tests call its hooks. */
type Hooks = Record<string, (...args: never[]) => unknown>;

/** Story tests' plugins, by name, the project's root set (as Vite resolves the config). */
const pluginsOf = () => {
  const plugins = createStorybookPlugin(options) as unknown as ({
    name: string;
  } & Hooks)[];
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const configResolved = byName.get("vitest-cucumber:browser")
    ?.configResolved as (config: {
    root: string;
    server: { fs: { allow: string[] } };
  }) => void;
  configResolved({ root: project, server: { fs: { allow: [project] } } });
  return { plugins, byName };
};

describe("a Storybook project's plugins in story tests (the preset's viteFinal gives them)", () => {
  test("the addon listed by its name, or its entry without `import`: the plugin's error, with what to give", () => {
    const { vitestCucumber: _, ...withoutOptions } = options;
    expect(() => createStorybookPlugin(withoutOptions)).toThrow(
      '[@lotun/vitest-cucumber] the "import" option is required, an array of your support code\'s globs, e.g. ["features/**/*.ts"]',
    );
  });

  test("what a page imports is pre-bundled at startup: the plugin's own packages, cucumber never, the support files for Vite's scanner", () => {
    const config = pluginsOf().byName.get("vitest-cucumber:browser")
      ?.config as (config: object) => {
      optimizeDeps: { include: string[]; exclude: string[]; entries: string[] };
    };
    const { optimizeDeps } = config({});
    // The `import` option's globs, as written: from the root, as Vite reads its entries.
    expect(optimizeDeps.entries).toEqual(["steps/*.ts"]);
    expect(optimizeDeps.exclude).toEqual([
      "@lotun/vitest-cucumber",
      "@cucumber/cucumber",
    ]);
    expect(optimizeDeps.include).toContain(
      "@lotun/vitest-cucumber > @cucumber/core",
    );
  });

  test("browser mode's hooks, without its feature transform; the stories module; the story tests' imports", () => {
    const { plugins, byName } = pluginsOf();
    expect(plugins.map(({ name }) => name)).toEqual([
      "vitest-cucumber:browser",
      "vitest-cucumber:storybook",
      "vitest-cucumber:storybook-tests",
    ]);
    const browser = byName.get("vitest-cucumber:browser");
    expect(Object.keys(browser ?? {})).toEqual(
      expect.arrayContaining([
        "config",
        "configResolved",
        "configureVitest",
        "resolveId",
      ]),
    );
    expect(browser).not.toHaveProperty("transform");
    // Its project's config: every task located, Vitest's file system module cache off (a browser
    // project's feature modules would be kept there: Vitest's bug).
    const config = (browser?.config as (config: object) => unknown)({});
    expect(config).toMatchObject({
      test: { includeTaskLocation: true, fsModuleCache: false },
    });
  });

  test("a stories module's import of the addon's test utilities: its feature module; anything else as it is", () => {
    const resolve = pluginsOf().byName.get("vitest-cucumber:storybook")
      ?.resolveId as (source: string, importer?: string) => unknown;
    const featureModule = `${feature}?vitest-cucumber-storybook`;
    expect(
      resolve("@storybook/addon-vitest/internal/test-utils", feature),
    ).toBe(featureModule);
    // Vitest itself, as it is (the addon's import is edited: `vitestImport.ts`).
    expect(resolve("vitest", feature)).toBeUndefined();
    // A feature module's id, as it is; its own import of the test utilities, the addon's.
    expect(resolve(featureModule, feature)).toBe(featureModule);
    expect(
      resolve("@storybook/addon-vitest/internal/test-utils", featureModule),
    ).toBeUndefined();
    // A stories file's own imports.
    expect(resolve("vitest", storiesFile)).toBeUndefined();
    expect(
      resolve("@storybook/addon-vitest/internal/test-utils", storiesFile),
    ).toBeUndefined();
  });

  test("a feature file's stories module: on a stories file that writes no title, Storybook's automatic one, by Storybook's options; linked by the addon entry's support files", async () => {
    const transform = pluginsOf().byName.get("vitest-cucumber:storybook")
      ?.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string } | undefined>;
    const made = await transform("", feature);
    expect(made?.code).toContain('  title: "stories/Auto/Feature: Auto",');
    expect(made?.code).not.toContain("throw");
  });
});
