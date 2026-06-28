import { afterEach, describe, expect, it } from "vitest";
import { cliConfig, mergeConfig } from "../config.ts";

describe("cliConfig", () => {
  describe("empty input", () => {
    it("returns {} when called with no argument", () => {
      expect(cliConfig()).toEqual({});
    });

    it("returns {} when called with undefined", () => {
      expect(cliConfig(undefined)).toEqual({});
    });

    it("returns {} when called with empty string", () => {
      expect(cliConfig("")).toEqual({});
    });
  });

  describe("valid options", () => {
    it("parses --tags (wraps expression in parentheses)", () => {
      expect(cliConfig("--tags @smoke")).toMatchObject({ tags: "(@smoke)" });
    });

    it("parses quoted --tags containing spaces", () => {
      expect(cliConfig('--tags "@smoke or @wip"')).toMatchObject({
        tags: "(@smoke or @wip)",
      });
    });

    it("parses --parallel as a number", () => {
      expect(cliConfig("--parallel 4")).toMatchObject({ parallel: 4 });
    });

    it("parses multiple options", () => {
      expect(cliConfig("--tags @smoke --parallel 2")).toMatchObject({
        tags: "(@smoke)",
        parallel: 2,
      });
    });
  });

  describe("invalid options", () => {
    it("throws on unknown flags", () => {
      expect(() => cliConfig("--totally-unknown-flag value")).toThrow();
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

  it("returns the base config when there are no CLI options", () => {
    delete process.env.CUCUMBER_OPTIONS;
    expect(mergeConfig({ tags: "@smoke" })).toMatchObject({ tags: "@smoke" });
  });

  it("lets CUCUMBER_OPTIONS override the base config", () => {
    process.env.CUCUMBER_OPTIONS = "--tags @wip";
    expect(mergeConfig({ tags: "@smoke" })).toMatchObject({ tags: "(@wip)" });
  });

  it("pins a concrete seed for order: random", () => {
    delete process.env.CUCUMBER_OPTIONS;
    expect(mergeConfig({ order: "random" }).order).toMatch(/^random:\d+$/);
  });

  it("throws when parallel is set in the base config", () => {
    delete process.env.CUCUMBER_OPTIONS;
    expect(() => mergeConfig({ parallel: 2 })).toThrow(
      "Parallel execution is not supported",
    );
  });

  it("throws when parallel comes from CUCUMBER_OPTIONS", () => {
    process.env.CUCUMBER_OPTIONS = "--parallel 4";
    expect(() => mergeConfig({})).toThrow(
      "Parallel execution is not supported use vitest parallelism instead.",
    );
  });
});
