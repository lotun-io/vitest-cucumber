import { beforeAll, describe, it, expect } from "vitest";
import * as path from "path";
import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import type { Results } from "../runCucumber.ts";
import { runCucumber } from "../runCucumber.ts";

// eslint-disable-next-line
const featuresDir = path.resolve(import.meta.dirname, "features");
const config = {
  import: [
    path.join(featuresDir, "support/*.ts"),
    path.join(featuresDir, "step_definitions/*.ts"),
  ],
};

let runConfiguration: IRunConfiguration;
let support: ISupportCodeLibrary;

beforeAll(async () => {
  ({ runConfiguration } = await loadConfiguration({
    provided: {
      format: [path.resolve(import.meta.dirname, "../silentFormatter.ts")],
      ...config,
      paths: [],
      import: [path.join(import.meta.dirname, "../loadSupport.ts")],
      require: [],
      parallel: undefined,
    },
  }));

  // @ts-expect-error
  global.__vitestCucumber = {
    moduleLoader: (specifier: string) => import(specifier),
    config,
  };
  support = await loadSupport(runConfiguration);
  // @ts-expect-error
  delete global.__vitestCucumber;
});

async function run(feature: string) {
  const results: Results = new Map();
  return runCucumber({
    id: path.join(featuresDir, feature),
    runConfiguration,
    support,
    results,
  });
}

describe("failing scenarios", () => {
  it("step that throws records the error message", async () => {
    const results = await run("failing-step.feature");
    const result = results.get("Step throws an error");
    expect(result?.message).toContain("intentional failure");
    expect(result?.failingStepLine).toBeDefined();
  });

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

  it("unknown step records UNDEFINED", async () => {
    const results = await run("unknown-step.feature");
    const result = results.get("Step has no matching definition");
    expect(result?.message).toContain("UNDEFINED");
  });
});
