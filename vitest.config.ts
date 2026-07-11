import { playwright } from "@vitest/browser-playwright";
import { defineConfig, TestUserConfig } from "vitest/config";
import { cucumber } from "./src/index.ts";

const createCucumberPlugin = (options: {
  type: "node" | "browser";
  worldParameters?: Record<string, any>;
}) => {
  const tags = options.type === "node" ? "not @notNode" : "not @notBrowser";
  return cucumber({
    import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
    worldParameters: options.worldParameters,
    tags,
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
const exclude = ({ shared }: { shared: boolean }) => {
  return [`features/**/*-shared-${!shared}.feature`];
};

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__*__/**", "src/index.ts"],
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
        plugins: [
          createCucumberPlugin({
            type: "node",
            worldParameters: { greeting: "hello", shared: false },
          }),
        ],
        test: {
          name: "node",
          sequence: { groupOrder: 1 },
          include,
          exclude: exclude({ shared: false }),
        },
      },
      {
        plugins: [
          createCucumberPlugin({
            type: "node",
            worldParameters: { greeting: "hello", shared: true },
          }),
        ],
        test: {
          name: "node-shared",
          sequence: { groupOrder: 2 },
          include,
          exclude: exclude({ shared: true }),
          isolate: false,
        },
      },
      {
        plugins: [
          createCucumberPlugin({
            type: "browser",
            worldParameters: { greeting: "hello", shared: false },
          }),
        ],
        test: {
          name: "browser",
          sequence: { groupOrder: 3 },
          include,
          exclude: exclude({ shared: false }),
          browser: createBrowserConfig(),
        },
      },
      {
        plugins: [
          createCucumberPlugin({
            type: "browser",
            worldParameters: { greeting: "hello", shared: true },
          }),
        ],
        test: {
          name: "browser-shared",
          sequence: { groupOrder: 4 },
          include,
          exclude: exclude({ shared: true }),
          browser: createBrowserConfig(),
          isolate: false,
        },
      },
      {
        plugins: [
          createCucumberPlugin({
            type: "browser",
            worldParameters: { greeting: "hello", shared: false },
          }),
        ],
        test: {
          name: "browser-api",
          sequence: { groupOrder: 5 },
          include: ["src/**/__browser__/**/*.test.ts"],
          browser: createBrowserConfig(),
        },
      },
    ],
  },
});
