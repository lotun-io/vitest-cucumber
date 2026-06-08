import type {
  IRunConfiguration,
  ISupportCodeLibrary,
} from "@cucumber/cucumber/api";
import { loadConfiguration, loadSupport } from "@cucumber/cucumber/api";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runCucumber } from "../runCucumber.ts";

const featuresDir = path.resolve(import.meta.dirname, "features");
const config = {
  import: [
    path.join("features", "support/**/*.ts"),
    path.join("features", "step_definitions/**/*.ts"),
  ],
  require: [os.devNull],
};

let runConfiguration: IRunConfiguration;
let support: ISupportCodeLibrary;
const testStepErrors: Map<string, Error> = new Map();

beforeAll(async () => {
  ({ runConfiguration } = await loadConfiguration({
    provided: {
      format: [
        `"${pathToFileURL(path.resolve(import.meta.dirname, "../silentFormatter.ts")).toString()}"`,
      ],
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
});

async function run(
  feature: string,
  { runtime }: { runtime?: Partial<IRunConfiguration["runtime"]> } = {},
) {
  const id = path.join(featuresDir, feature);

  testStepErrors.clear();

  const results = await runCucumber({
    id,
    runConfiguration: {
      ...runConfiguration,
      runtime: { ...runConfiguration.runtime, ...runtime },
    },
    support,
    testStepErrors,
  });
  return new Map(results.values().map((value) => [value.name, value]));
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
      expect(err as Error).toBeInstanceOf(Error);
      const message =
        (err as Error & { cause?: Error }).cause?.message ??
        (err as Error).message;
      expect(message).toContain("BeforeAll hook failed intentionally");
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
      expect(err as Error).toBeInstanceOf(Error);
      const message =
        (err as Error & { cause?: Error }).cause?.message ??
        (err as Error).message;
      expect(message).toContain("AfterAll hook failed intentionally");
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

  it("retry: scenario result reflects final attempt after all retries exhausted", async () => {
    const results = await run("failing-step.feature", {
      runtime: { retry: 1 },
    });
    const result = results.get("Step throws an error");
    expect(result?.status).toBe("FAILED");
    expect(result?.stepResult?.message).toContain("intentional failure");
  });

  it("retry: scenario passes when second attempt succeeds", async () => {
    delete process.env.RETRY_STEP_ATTEMPTED;
    const results = await run("retry.feature", { runtime: { retry: 1 } });
    const result = results.get("Step passes on retry");
    expect(result?.status).toBe("PASSED");
  });
});
