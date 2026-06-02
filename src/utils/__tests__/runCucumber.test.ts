import { beforeAll, describe, it, expect } from "vitest";
import * as path from "path";
import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import type { Results } from "../runCucumber.ts";
import { runCucumber } from "../runCucumber.ts";

const featuresDir = path.resolve(import.meta.dirname, "features");
const config = {
  import: [
    path.join("features", "support/**/*.ts"),
    path.join("features", "step_definitions/**/*.ts"),
  ],
};

let runConfiguration: IRunConfiguration;
let support: ISupportCodeLibrary;
const testStepErrors: Map<string, Error> = new Map();

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

  global.__vitestCucumber = {
    moduleLoader: (specifier: string) => import(specifier),
    config,
    testStepErrors,
  };
  support = await loadSupport(runConfiguration);
  delete global.__vitestCucumber;
});

async function run(feature: string) {
  const results: Results = new Map();
  testStepErrors.clear();
  return runCucumber({
    id: path.join(featuresDir, feature),
    runConfiguration,
    support,
    testStepErrors,
    results,
  });
}

describe("failing scenarios", () => {
  it("step that throws records the error message", async () => {
    const results = await run("failing-step.feature");
    const result = results.get("Step throws an error");
    expect(result?.stepResult?.message).toContain("intentional failure");
    expect(result?.step).toBeDefined();
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

  it("unknown step records UNDEFINED when first step is undefined", async () => {
    const results = await run("unknown-step.feature");
    const result = results.get("First step is undefined");
    expect(result?.status).toBe("UNDEFINED");
  });

  it("unknown step records UNDEFINED when last step is undefined", async () => {
    const results = await run("unknown-step.feature");
    const result = results.get("Last step is undefined");
    expect(result?.status).toBe("UNDEFINED");
  });

  it("first failure wins when subsequent steps are skipped", async () => {
    const results = await run("first-failure-wins.feature");
    const result = results.get(
      "First step fails and subsequent steps are skipped",
    );
    expect(result?.status).toBe("FAILED");
    expect(result?.stepResult?.exception).toBeDefined();
    expect(result?.stepResult?.message).toContain("intentional failure");
  });

  it("Before hook failure is recorded", async () => {
    const results = await run("hook-errors.feature");
    const result = results.get("Before hook fails");
    expect(result?.status).toBe("FAILED");
    expect(result?.stepResult?.message).toContain(
      "Before hook failed intentionally",
    );
  });

  it("After hook failure is recorded", async () => {
    const results = await run("hook-errors.feature");
    const result = results.get("After hook fails");
    expect(result?.status).toBe("FAILED");
    expect(result?.stepResult?.message).toContain(
      "After hook failed intentionally",
    );
  });

  it("BeforeAll hook failure rejects with the hook error", async () => {
    process.env.FAIL_BEFORE_ALL = "1";
    try {
      await run("hook-errors.feature");
    } catch (err) {
      expect((err as Error).cause).toBeInstanceOf(Error);
      expect(((err as Error).cause as Error).message).toBe(
        "BeforeAll hook failed intentionally",
      );
      return;
    } finally {
      delete process.env.FAIL_BEFORE_ALL;
    }
    expect.fail("Expected runCucumber to reject");
  });

  it("AfterAll hook failure rejects with the hook error", async () => {
    process.env.FAIL_AFTER_ALL = "1";
    try {
      await run("hook-errors.feature");
    } catch (err) {
      expect((err as Error).cause).toBeInstanceOf(Error);
      expect(((err as Error).cause as Error).message).toBe(
        "AfterAll hook failed intentionally",
      );
      return;
    } finally {
      delete process.env.FAIL_AFTER_ALL;
    }
    expect.fail("Expected runCucumber to reject");
  });

  it("assertion error captures showDiff, expected and actual", async () => {
    const results = await run("show-diff.feature");
    const result = results.get("Assertion error carries showDiff");
    expect(result?.status).toBe("FAILED");
    expect(result?.error).toBeDefined();
    expect(result?.error?.showDiff).toBe(true);
    expect(result?.error?.expected).toBeDefined();
    expect(result?.error?.actual).toBeDefined();
  });
});
