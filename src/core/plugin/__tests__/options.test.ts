import { expect, test } from "vitest";
import type { CucumberOptions } from "../../../types/feature.ts";
import { configurationOf, runOptionsOf } from "../options.ts";

/** The error `configurationOf` throws for options a config may give, whatever their type says. */
const errorOf = (options: Record<string, unknown>) => {
  try {
    configurationOf(options as CucumberOptions);
  } catch (error) {
    return error;
  }
  return undefined;
};

test("no option given: cucumber's defaults", () => {
  expect(configurationOf({})).toEqual({
    import: [],
    dryRun: false,
    backtrace: false,
    language: "en",
    strict: true,
    worldParameters: {},
  });
});

test("the options given: as given, the others cucumber's defaults", () => {
  expect(
    configurationOf({
      import: ["features/**/*.ts"],
      dryRun: true,
      backtrace: true,
      language: "fr",
      strict: false,
      worldParameters: { url: "http://a" },
    }),
  ).toEqual({
    import: ["features/**/*.ts"],
    dryRun: true,
    backtrace: true,
    language: "fr",
    strict: false,
    worldParameters: { url: "http://a" },
  });
  expect(configurationOf({ strict: false })).toMatchObject({
    strict: false,
    dryRun: false,
    language: "en",
  });
});

test("an option the plugin doesn't support (untyped): left out", () => {
  const given: Record<string, unknown> = {
    import: ["steps/*.ts"],
    retry: 1,
    paths: ["nowhere/*.feature"],
    format: [["message", "messages.ndjson"]],
  };
  expect(Object.keys(configurationOf(given as CucumberOptions)).sort()).toEqual(
    ["backtrace", "dryRun", "import", "language", "strict", "worldParameters"],
  );
});

test("the world parameters: a JSON copy, as the Worlds get them", () => {
  const worldParameters = { list: [1] };
  const configuration = configurationOf({ worldParameters });
  expect(configuration.worldParameters).toEqual(worldParameters);
  expect(configuration.worldParameters).not.toBe(worldParameters);
});

test("`import` that isn't an array of strings: the plugin's error", () => {
  for (const globs of ["features/**/*.ts", [1], [["features"]]]) {
    expect(errorOf({ import: globs })).toMatchObject({
      message:
        '@lotun/vitest-cucumber: the "import" option must be an array of strings',
    });
  }
});

test("a `language` Gherkin doesn't have: the plugin's error", () => {
  expect(errorOf({ language: "klingon" })).toMatchObject({
    message:
      '@lotun/vitest-cucumber: the "language" option "klingon" isn\'t a Gherkin language',
  });
  // An object's own members aren't languages.
  expect(errorOf({ language: "toString" })).toBeDefined();
  expect(errorOf({ language: "en-pirate" })).toBeUndefined();
});

test("world parameters JSON refuses: the plugin's error", () => {
  expect(errorOf({ worldParameters: { limit: 10n } })).toMatchObject({
    message:
      "@lotun/vitest-cucumber: the worldParameters config option can't be converted to JSON",
  });
});

test("the run's options: what the runtime reads of the configuration", () => {
  expect(
    runOptionsOf(configurationOf({ dryRun: true, worldParameters: { a: 1 } })),
  ).toEqual({ strict: true, dryRun: true, worldParameters: { a: 1 } });
});
