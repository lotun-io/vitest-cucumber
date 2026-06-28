import { playwright } from "@vitest/browser-playwright";
import { defineConfig, TestUserConfig } from "vitest/config";
import { cucumber } from "./src/index.ts";

const createCucumberPlugin = (options: { type: "node" | "browser" }) => {
  return cucumber({
    import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
    worldParameters: { greeting: "hello" },
    tags: options.type === "node" ? "not @notNode" : "not @notBrowser",
    retry: 1,
    retryTagFilter: "@retry",
  });
};

const createBrowserConfig = (): TestUserConfig["browser"] => ({
  enabled: true,
  provider: playwright(),
  instances: [{ browser: "chromium" }],
  headless: true,
  screenshotFailures: false,
});

const include = ["features/**/*.feature"];

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/index.ts"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          sequence: { groupOrder: 0 },
          include: ["src/**/__tests__/**/*.test.ts"],
        },
      },
      {
        plugins: [createCucumberPlugin({ type: "node" })],
        test: {
          name: "node-isolate",
          sequence: { groupOrder: 1 },
          include,
        },
      },
      {
        plugins: [createCucumberPlugin({ type: "node" })],
        test: {
          name: "node",
          sequence: { groupOrder: 2 },
          include,
          isolate: false,
        },
      },
      {
        plugins: [createCucumberPlugin({ type: "browser" })],
        test: {
          name: "browser-isolate",
          sequence: { groupOrder: 3 },
          include,
          browser: createBrowserConfig(),
        },
      },
      {
        plugins: [createCucumberPlugin({ type: "browser" })],
        test: {
          name: "browser",
          sequence: { groupOrder: 4 },
          include,
          browser: createBrowserConfig(),
          isolate: false,
        },
      },
    ],
  },
});
