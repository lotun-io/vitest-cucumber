import { afterEach, describe, expect, it } from "vitest";
import { cliArgs, mergeConfig, resolveSupportGlobs } from "../config.ts";

// Cucumber resolves `--config` relative to cwd (the repo root during tests).
const profileConfig = "src/utils/__tests__/fixtures/cucumber.ts";

describe("cliArgs", () => {
  describe("empty input", () => {
    it("returns an empty configuration when called with no argument", () => {
      expect(cliArgs()).toEqual({ configuration: {} });
    });

    it("returns an empty configuration when called with undefined", () => {
      expect(cliArgs(undefined)).toEqual({ configuration: {} });
    });

    it("returns an empty configuration when called with empty string", () => {
      expect(cliArgs("")).toEqual({ configuration: {} });
    });
  });

  describe("valid options", () => {
    it("parses --tags (wraps expression in parentheses)", () => {
      expect(cliArgs("--tags @smoke").configuration).toMatchObject({
        tags: "(@smoke)",
      });
    });

    it("parses quoted --tags containing spaces", () => {
      expect(cliArgs('--tags "@smoke or @wip"').configuration).toMatchObject({
        tags: "(@smoke or @wip)",
      });
    });

    it("parses --parallel as a number", () => {
      expect(cliArgs("--parallel 4").configuration).toMatchObject({
        parallel: 4,
      });
    });

    it("extracts --profile into its own bucket (repeatable)", () => {
      const { profiles, configuration } = cliArgs(
        "--profile ci --profile slow",
      );
      expect(profiles).toEqual(["ci", "slow"]);
      expect(configuration).not.toHaveProperty("profile");
    });

    it("extracts --config into its own bucket", () => {
      const { file, configuration } = cliArgs("--config my.cucumber.json");
      expect(file).toBe("my.cucumber.json");
      expect(configuration).not.toHaveProperty("config");
    });

    it("leaves profiles/file undefined when not specified", () => {
      const { profiles, file } = cliArgs("--tags @smoke");
      expect(profiles).toBeUndefined();
      expect(file).toBeUndefined();
    });
  });

  describe("invalid options", () => {
    it("throws on unknown flags", () => {
      expect(() => cliArgs("--totally-unknown-flag value")).toThrow();
    });
  });
});

describe("mergeConfig", () => {
  const original = process.env.CUCUMBER_OPTIONS;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.CUCUMBER_OPTIONS;
    } else {
      process.env.CUCUMBER_OPTIONS = original;
    }
  });

  it("returns the base config when there are no CLI options", async () => {
    delete process.env.CUCUMBER_OPTIONS;
    await expect(mergeConfig({ tags: "@smoke" })).resolves.toMatchObject({
      tags: "@smoke",
    });
  });

  it("lets CUCUMBER_OPTIONS override the base config", async () => {
    process.env.CUCUMBER_OPTIONS = "--tags @wip";
    await expect(mergeConfig({ tags: "@smoke" })).resolves.toMatchObject({
      tags: "(@wip)",
    });
  });

  it("pins a concrete seed for order: random", async () => {
    delete process.env.CUCUMBER_OPTIONS;
    const mergedConfig = await mergeConfig({ order: "random" });
    expect(mergedConfig.order).toMatch(/^random:\d+$/);
  });

  it("throws when parallel is set in the base config", async () => {
    delete process.env.CUCUMBER_OPTIONS;
    await expect(mergeConfig({ parallel: 2 })).rejects.toThrow(
      "Parallel execution is not supported",
    );
  });

  it("throws when parallel comes from CUCUMBER_OPTIONS", async () => {
    process.env.CUCUMBER_OPTIONS = "--parallel 4";
    await expect(mergeConfig({})).rejects.toThrow(
      "Parallel execution is not supported use vitest parallelism instead.",
    );
  });

  it("sources a named --profile from a --config file", async () => {
    process.env.CUCUMBER_OPTIONS = `--config ${profileConfig} --profile ci`;
    const mergedConfig = await mergeConfig({});
    // The `ci` profile sets tags + retry; both flow into the resolved config.
    expect(mergedConfig.tags).toContain("@ci");
    expect(mergedConfig.retry).toBe(3);
  });

  it("lets provided plugin config override the profile (provided > profile)", async () => {
    process.env.CUCUMBER_OPTIONS = `--config ${profileConfig} --profile ci`;
    const mergedConfig = await mergeConfig({ retry: 1 });
    expect(mergedConfig.retry).toBe(1);
  });

  it("concatenates a profile's import globs with the plugin's (additive)", async () => {
    process.env.CUCUMBER_OPTIONS = `--config ${profileConfig} --profile ci`;
    const mergedConfig = await mergeConfig({
      import: ["features/steps/**/*.ts"],
    });
    // `import` is an additive array in Cucumber's merge, so the profile's globs
    // join the plugin's — this is what makes the browser page glob profile-aware.
    expect(mergedConfig.import).toContain("features/steps/**/*.ts");
    expect(mergedConfig.import).toContain("features/import.ts");
  });
});

describe("resolveSupportGlobs", () => {
  const original = process.env.CUCUMBER_OPTIONS;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.CUCUMBER_OPTIONS;
    } else {
      process.env.CUCUMBER_OPTIONS = original;
    }
  });

  it("returns the resolved import/require globs split by key", async () => {
    delete process.env.CUCUMBER_OPTIONS;
    const globs = await resolveSupportGlobs({
      import: ["features/steps/**/*.ts", "./support/*.ts"],
      require: ["legacy/**/*.cjs"],
    });
    expect(globs.import).toEqual(["features/steps/**/*.ts", "./support/*.ts"]);
    expect(globs.require).toEqual(["legacy/**/*.cjs"]);
  });

  it("returns empty arrays when no globs are configured", async () => {
    delete process.env.CUCUMBER_OPTIONS;
    expect(await resolveSupportGlobs({})).toEqual({ import: [], require: [] });
  });

  it("is profile-aware (import AND require globs from a --profile)", async () => {
    process.env.CUCUMBER_OPTIONS = `--config ${profileConfig} --profile ci`;
    const globs = await resolveSupportGlobs({
      import: ["features/steps/**/*.ts"],
    });
    expect(globs.import).toContain("features/steps/**/*.ts");
    expect(globs.import).toContain("features/import.ts");
    expect(globs.require).toContain("features/require.ts");
  });
});
