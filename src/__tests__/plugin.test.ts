import { afterEach, describe, expect, it } from "vitest";
import type { Plugin } from "vitest/config";
import { cucumber } from "../plugin.ts";
import { DEFAULT_IMPORT_GLOB } from "../utils/config.ts";
import { PUBLISH_DIR_ENV } from "../utils/publish.ts";

const nodePlugin = (config?: Parameters<typeof cucumber>[0]) =>
  cucumber(config).find((p) => p.name === "vitest-cucumber:node") as Plugin;

const browserPlugin = (config?: Parameters<typeof cucumber>[0]) =>
  cucumber(config).find((p) => p.name === "vitest-cucumber:browser") as Plugin;

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

  describe("node plugin config hook", () => {
    type NodeConfigResult = {
      test: { globalSetup: string[]; env?: Record<string, string> };
    };
    const callConfig = () =>
      (nodePlugin().config as () => Promise<NodeConfigResult>)();

    it("returns globalSetup pointing at publishGlobalSetup", async () => {
      const result = await callConfig();
      expect(result.test.globalSetup).toHaveLength(1);
      expect(result.test.globalSetup[0]).toContain("publishGlobalSetup");
    });

    it("does not set env when publish is disabled", async () => {
      const result = await callConfig();
      expect(result.test.env).toBeUndefined();
    });

    describe("when publish is enabled", () => {
      afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[PUBLISH_DIR_ENV];
      });

      it("sets env with the publish dir path", async () => {
        const result = await (
          nodePlugin({ publish: true })
            .config as () => Promise<NodeConfigResult>
        )();
        expect(result.test.env?.[PUBLISH_DIR_ENV]).toMatch(
          /vitest-cucumber-publish/,
        );
      });
    });
  });

  describe("browser plugin", () => {
    describe("config hook", () => {
      type BrowserConfigResult = {
        optimizeDeps: { exclude: string[] };
        test: {
          globalSetup: string[];
          env?: Record<string, string>;
          browser: { commands: unknown };
        };
      };
      const callConfig = () => {
        const plugin = browserPlugin();
        return (plugin.config as () => Promise<BrowserConfigResult>)();
      };

      it("excludes @cucumber/cucumber from optimizeDeps", async () => {
        const result = await callConfig();
        expect(result.optimizeDeps.exclude).toContain("@cucumber/cucumber");
      });

      it("returns globalSetup pointing at publishGlobalSetup", async () => {
        const result = await callConfig();
        expect(result.test.globalSetup[0]).toContain("publishGlobalSetup");
      });

      it("does not set env when publish is disabled", async () => {
        const result = await callConfig();
        expect(result.test.env).toBeUndefined();
      });

      describe("when publish is enabled", () => {
        afterEach(() => {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete process.env[PUBLISH_DIR_ENV];
        });

        it("sets env with the publish dir path", async () => {
          const result = await (
            browserPlugin({ publish: true })
              .config as () => Promise<BrowserConfigResult>
          )();
          expect(result.test.env?.[PUBLISH_DIR_ENV]).toMatch(
            /vitest-cucumber-publish/,
          );
        });
      });
    });

    describe("resolveId", () => {
      const call = (source: string, options?: { ssr?: boolean }) => {
        const plugin = browserPlugin();
        return (
          plugin.resolveId as (
            source: string,
            importer: undefined,
            options?: { ssr?: boolean },
          ) => unknown
        )(source, undefined, options);
      };

      it("redirects @cucumber/cucumber to the shim in browser realm", () => {
        const result = call("@cucumber/cucumber") as string;
        expect(result).toContain("cucumberShim");
      });

      it("does not redirect @cucumber/cucumber in SSR realm", () => {
        expect(call("@cucumber/cucumber", { ssr: true })).toBeNull();
      });

      it("returns null for other sources", () => {
        expect(call("some-other-module")).toBeNull();
      });
    });

    describe("transform", () => {
      const call = (code: string, id: string) => {
        const plugin = browserPlugin();
        return (
          plugin.transform as (code: string, id: string) => Promise<unknown>
        )(code, id);
      };

      it("returns null for non-feature files", async () => {
        expect(await call("", "steps.ts")).toBeNull();
      });

      it("returns code with runFeatureFile for .feature files", async () => {
        const result = (await call("", "my.feature")) as {
          code: string;
          map: null;
        };
        expect(result.map).toBeNull();
        expect(result.code).toContain("runFeatureFile");
      });

      it("passes the file id to runFeatureFile", async () => {
        const result = (await call("", "/path/to/my.feature")) as {
          code: string;
        };
        expect(result.code).toContain("/path/to/my.feature");
      });

      it("includes import.meta.glob with the resolved step globs", async () => {
        const result = (await call("", "my.feature")) as { code: string };
        expect(result.code).toContain("import.meta.glob");
        expect(result.code).toContain(DEFAULT_IMPORT_GLOB);
      });
    });
  });
});
