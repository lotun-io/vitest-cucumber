import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
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
