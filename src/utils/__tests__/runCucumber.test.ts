import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareRunConfiguration, type WithHook } from "../config.ts";
import { globalRef } from "../globals.ts";
import { runCucumber } from "../runCucumber.ts";
import type { SerializedError } from "../serializeError.ts";

const featuresDir = path.resolve(import.meta.dirname, "features");
const config = {
  import: [
    path.join(featuresDir, "support", "**/*.ts"),
    path.join(featuresDir, "steps", "**/*.ts"),
  ],
  require: [os.devNull],
};

let runConfiguration: IRunConfiguration;
let support: ISupportCodeLibrary;
const testStepErrors: Map<string, SerializedError> = new Map();

beforeAll(async () => {
  ({ runConfiguration } = await loadConfiguration({
    provided: {
      format: [
        `"${pathToFileURL(path.resolve(import.meta.dirname, "../silentFormatter.ts")).toString()}"`,
      ],
      ...config,
      paths: [],
      import: [path.join(import.meta.dirname, "../../node/loadSupport.ts")],
      require: [],
      parallel: undefined,
    },
  }));

  globalRef.__vitest_cucumber_node__ ??= {};

  globalRef.__vitest_cucumber_node__.support = {
    moduleLoader: (specifier: string) => import(specifier),
    config,
    testStepErrors,
  };
  support = await loadSupport(runConfiguration);
});

async function run(
  feature: string,
  { withHook }: { withHook?: WithHook } = {},
) {
  const id = path.join(featuresDir, feature);

  const { results } = await runCucumber({
    id,
    runConfiguration: prepareRunConfiguration({
      id,
      runConfiguration,
      support,
      withHook: withHook ?? "none",
    }),
    testStepErrors,
  });
  return new Map(results.values().map((value) => [value.name ?? "", value]));
}

describe("failing scenarios", () => {
  it("parse error throws with all errors listed", async () => {
    const relPath = path.relative(
      process.cwd(),
      path.join(featuresDir, "parse-error.feature"),
    );
    await expect(run("parse-error.feature")).rejects.toThrow(
      [
        "Parse failure",
        `Parse error in "${relPath}" (1:1): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'FeatureParse: Error'`,
        `Parse error in "${relPath}" (3:5): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'ScenarioParse: Error'`,
        `Parse error in "${relPath}" (4:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'GivenParse Error'`,
        `Parse error in "${relPath}" (5:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'WhenParse Error'`,
        `Parse error in "${relPath}" (6:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'ThenParse Error'`,
      ].join("\n"),
    );
  });

  it("BeforeAll hook failure rejects with the hook error", async () => {
    process.env.FAIL_BEFORE_ALL = "1";
    try {
      await run("hook-errors.feature", { withHook: "before" });
    } catch (err) {
      expect(err as Error).toBeInstanceOf(Error);
      const message =
        (err as Error & { cause?: Error }).cause?.message ??
        (err as Error).message;
      expect(message).toContain("BeforeAll failed intentionally");
      return;
    } finally {
      delete process.env.FAIL_BEFORE_ALL;
    }
    expect.fail("Expected runCucumber to reject");
  });

  it("AfterAll hook failure rejects with the hook error", async () => {
    process.env.FAIL_AFTER_ALL = "1";
    try {
      await run("hook-errors.feature", { withHook: "after" });
    } catch (err) {
      expect(err as Error).toBeInstanceOf(Error);
      const message =
        (err as Error & { cause?: Error }).cause?.message ??
        (err as Error).message;
      expect(message).toContain("AfterAll failed intentionally");
      return;
    } finally {
      delete process.env.FAIL_AFTER_ALL;
    }
    expect.fail("Expected runCucumber to reject");
  });
});
