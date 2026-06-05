import { describe, expect, it } from "vitest";
import { cliConfig } from "../config.ts";

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
