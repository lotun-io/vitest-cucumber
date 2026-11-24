import { expect, test } from "vitest";
import type { CucumberOptions } from "../../../types/feature.ts";
import { configurationOf, runOptionsOf } from "../options.ts";

/** The error `configurationOf` throws for options a config may give, whatever their type says. */
const thrownFor = (options?: Record<string, unknown>) => {
  try {
    configurationOf(options as CucumberOptions | undefined);
  } catch (error) {
    return error;
  }
  return undefined;
};

test("only `import` given: cucumber's defaults for the others", () => {
  expect(configurationOf({ import: [] })).toEqual({
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
  expect(configurationOf({ import: [], strict: false })).toMatchObject({
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
  const configuration = configurationOf({ import: [], worldParameters });
  expect(configuration.worldParameters).toEqual(worldParameters);
  expect(configuration.worldParameters).not.toBe(worldParameters);
});

test("no `import`, or not an array of strings: the plugin's error, with what to give", () => {
  const error = {
    message:
      '@lotun/vitest-cucumber: the "import" option is required: an array of your support code\'s globs, e.g. ["features/**/*.ts"]',
  };
  // `cucumber()` from JavaScript, or a Storybook addon entry without options.
  expect(thrownFor()).toMatchObject(error);
  expect(thrownFor({})).toMatchObject(error);
  expect(thrownFor({ strict: false })).toMatchObject(error);
  for (const globs of [null, "features/**/*.ts", [1], [["features"]]]) {
    expect(thrownFor({ import: globs })).toMatchObject(error);
  }
});

test("a `language` Gherkin doesn't have: the plugin's error", () => {
  expect(thrownFor({ import: [], language: "klingon" })).toMatchObject({
    message:
      '@lotun/vitest-cucumber: the "language" option "klingon" isn\'t a Gherkin language',
  });
  // An object's own members aren't languages.
  expect(thrownFor({ import: [], language: "toString" })).toBeDefined();
  expect(thrownFor({ import: [], language: "en-pirate" })).toBeUndefined();
});

test("world parameters JSON refuses: the plugin's error", () => {
  expect(
    thrownFor({ import: [], worldParameters: { limit: 10n } }),
  ).toMatchObject({
    message: `@lotun/vitest-cucumber: the "worldParameters" option can't be converted to JSON`,
  });
});

test("the run's options: what the runtime reads of the configuration", () => {
  expect(
    runOptionsOf(
      configurationOf({ import: [], dryRun: true, worldParameters: { a: 1 } }),
    ),
  ).toEqual({ strict: true, dryRun: true, worldParameters: { a: 1 } });
});
