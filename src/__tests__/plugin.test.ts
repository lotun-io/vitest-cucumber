import { describe, it, expect } from "vitest";
import { cucumber } from "../plugin.ts";

describe("cucumber plugin", () => {
  it("returns a plugin named vitest-cucumber", () => {
    const plugin = cucumber();
    expect(plugin.name).toBe("vitest-cucumber");
  });

  it("returns a plugin with a transform hook", () => {
    const plugin = cucumber();
    expect(typeof plugin.transform).toBe("function");
  });

  describe("transform", () => {
    const call = (code: string, id: string) => {
      const plugin = cucumber();
      // Vite transform can be a function or an object with a handler; here it is a plain function
      return (plugin.transform as (code: string, id: string) => unknown)(
        code,
        id,
      );
    };

    it("returns null for non-feature files", () => {
      expect(call("", "steps.ts")).toBeNull();
      expect(call("", "foo.js")).toBeNull();
    });

    it("returns an object with code and map for .feature files", () => {
      const featureContent =
        "Feature: My Feature\n  Scenario: s\n    Given a step\n";
      const result = call(featureContent, "my.feature") as {
        code: string;
        map: null;
      };
      expect(result).not.toBeNull();
      expect(result.map).toBeNull();
      expect(typeof result.code).toBe("string");
    });

    it("generated code calls runFeatureFile", () => {
      const featureContent =
        "Feature: My Feature\n  Scenario: s\n    Given a step\n";
      const result = call(featureContent, "my.feature") as { code: string };
      expect(result.code).toContain("runFeatureFile");
    });

    it("passes the raw feature content to runFeatureFile", () => {
      const featureContent =
        "Feature: My Feature\n  Scenario: First\n    Given a step\n";
      const result = call(featureContent, "my.feature") as { code: string };
      expect(result.code).toContain("My Feature");
      expect(result.code).toContain("First");
    });

    it("passes the file id to runFeatureFile", () => {
      const featureContent = "Feature: F\n  Scenario: s\n    Given a step\n";
      const result = call(featureContent, "/path/to/my.feature") as {
        code: string;
      };
      expect(result.code).toContain("/path/to/my.feature");
    });
  });
});
