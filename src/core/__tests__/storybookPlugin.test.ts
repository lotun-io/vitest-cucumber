import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createBrowserPlugin } from "../browserPlugin.ts";
import type { PresetOptions } from "../storybook/preset/project.ts";
import { storybookOptionsPlugin } from "../storybook/vitest/storybookOptions.ts";
import { storybookCucumber } from "../storybookPlugin.ts";

const addon = { name: "vite-plugin-storybook-test" };

/** A folder with a stories file and the feature file next to it. */
const folder = mkdtempSync(path.join(tmpdir(), "storybook-plugin-"));
writeFileSync(path.join(folder, "Login.stories.ts"), "");
writeFileSync(path.join(folder, "Login.feature"), "Feature: Login\n");
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** The plugin's `resolveId`, in an environment whose top-level config has `plugins`. */
const resolverOf = (plugins: { name: string }[]) => {
  const [plugin] = storybookCucumber({ core: {} } as never) as unknown as [
    {
      resolveId: (
        this: unknown,
        source: string,
        importer: string | undefined,
      ) => string | undefined;
    },
  ];
  const context = {
    environment: { getTopLevelConfig: () => ({ plugins }) },
  };
  return (source: string, importer: string | undefined) =>
    plugin.resolveId.call(context, source, importer);
};

describe("the plugin in a Storybook project's environments", () => {
  test("a feature file's stories module: its import of the addon's test utilities its feature module", () => {
    const resolve = resolverOf([addon]);
    const feature = path.join(folder, "Login.feature");
    expect(
      resolve("@storybook/addon-vitest/internal/test-utils", feature),
    ).toBe(`${feature}?vitest-cucumber-storybook`);
    // Vitest itself, as it is (the addon's import is edited: `vitestImport.ts`).
    expect(resolve("vitest", feature)).toBeUndefined();
    // A feature module's id, as it is; its own import of the test utilities, the addon's.
    expect(resolve(`${feature}?vitest-cucumber-storybook`, feature)).toBe(
      `${feature}?vitest-cucumber-storybook`,
    );
    expect(
      resolve(
        "@storybook/addon-vitest/internal/test-utils",
        `${feature}?vitest-cucumber-storybook`,
      ),
    ).toBeUndefined();
  });

  test("a stories file: its `vitest` and the addon's modules as they are", () => {
    const resolve = resolverOf([addon]);
    const stories = path.join(folder, "Login.stories.ts");
    expect(resolve("vitest", stories)).toBeUndefined();
    expect(
      resolve("@storybook/addon-vitest/internal/test-utils", stories),
    ).toBeUndefined();
  });

  test("an environment without Storybook's addon: nothing resolved", () => {
    const feature = path.join(folder, "Login.feature");
    expect(
      resolverOf([])("@storybook/addon-vitest/internal/test-utils", feature),
    ).toBeUndefined();
  });
});

test("a feature file's stories module in story tests: on a stories file that writes no title, Storybook's automatic one, by Storybook's options, which the preset's plugin carries among the project's plugins; the preset not loaded: the feature's error", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "storybook-titles-"));
  const write = (name: string, content: string) => {
    mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
    writeFileSync(path.join(project, name), content);
    return path.join(project, name);
  };
  write(
    "steps/stories.ts",
    `Given("the {storybook:story} story", (story) => {});`,
  );
  write(
    "src/stories/Auto.stories.ts",
    "export default {};\nexport const Plain = {};\n",
  );
  const feature = write(
    "src/stories/Auto.feature",
    "Feature: Auto\n  Scenario: Plain\n    Given the Plain story\n",
  );
  /** Storybook's options, as the preset's functions get them. */
  const options = {
    configDir: path.join(project, ".storybook"),
    presets: {
      apply: () =>
        Promise.resolve(["../src/**/*.stories.ts", "../src/**/*.feature"]),
    },
  } as unknown as PresetOptions;
  /** The feature's stories module, in a project of `plugins`. */
  const storiesModuleIn = async (plugins: { name: string }[]) => {
    const browser = createBrowserPlugin({ import: ["steps/*.ts"] });
    browser.core.configResolved({ root: project });
    const [plugin] = storybookCucumber(browser) as unknown as [
      {
        configResolved: (config: { plugins: { name: string }[] }) => void;
        transform: (
          this: unknown,
          code: string,
          id: string,
        ) => Promise<{ code: string } | undefined>;
      },
    ];
    plugin.configResolved({ plugins });
    const made = await plugin.transform.call(
      { environment: { getTopLevelConfig: () => ({ plugins }) } },
      "",
      feature,
    );
    return made?.code;
  };
  try {
    expect(
      await storiesModuleIn([addon, storybookOptionsPlugin(options)]),
    ).toContain('  title: "stories/Auto/Feature: Auto",');
    expect(await storiesModuleIn([addon])).toContain(
      `Storybook's preset of the plugin isn't loaded: add \\"@lotun/vitest-cucumber/storybook\\" to the \\"addons\\" of .storybook/main.ts`,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
