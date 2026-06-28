import { describe, expect, it } from "vitest";
import type { Plugin } from "vitest/config";
import { cucumber } from "../plugin.ts";

const nodePlugin = () =>
  cucumber().find((p) => p.name === "vitest-cucumber:node") as Plugin;

describe("cucumber plugin", () => {
  it("returns node and browser mode plugins", () => {
    const plugins = cucumber();
    expect(plugins.map((p) => p.name)).toEqual([
      "vitest-cucumber:node",
      "vitest-cucumber:browser",
    ]);
  });

  it("each plugin self-selects via apply", () => {
    const [node, browser] = cucumber();
    const browserConfig = { test: { browser: { enabled: true } } };
    const nodeConfig = { test: {} };
    const applies = (p: Plugin, c: unknown) =>
      (p.apply as (config: unknown) => boolean).call(undefined, c);
    expect(applies(node, nodeConfig)).toBe(true);
    expect(applies(node, browserConfig)).toBe(false);
    expect(applies(browser, browserConfig)).toBe(true);
    expect(applies(browser, nodeConfig)).toBe(false);
  });

  it("the node plugin has a transform hook", () => {
    expect(typeof nodePlugin().transform).toBe("function");
  });

  describe("transform", () => {
    const call = (code: string, id: string) => {
      const plugin = nodePlugin();
      // Vite transform can be a function or an object with a handler; here it is a plain function
      return (plugin.transform as (code: string, id: string) => unknown).call(
        undefined,
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

    it("passes the file id to runFeatureFile", () => {
      const featureContent = "Feature: F\n  Scenario: s\n    Given a step\n";
      const result = call(featureContent, "/path/to/my.feature") as {
        code: string;
      };
      expect(result.code).toContain("/path/to/my.feature");
    });
  });
});
