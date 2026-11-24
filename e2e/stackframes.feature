Feature: Stack frames
  A step's error as Vitest prints it, in each engine: its frames in the user's code are the ones
  Vitest prints for the same error in a plain test, in the same run (the engine's own: its columns,
  its async frames' names, its frames in tail position). Before them, the step's line in the feature
  file; after them, none of cucumber's.

  Background:
    Given a file named "src/helpers.ts" with:
      """
      export const throwInHelper = () => {
        throw new TypeError("thrown in a helper");
      };

      export const callHelper = () => {
        throwInHelper();
      };

      export const throwAfterAwait = async () => {
        await Promise.resolve();
        throw new Error("thrown after an await");
      };
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { callHelper, throwAfterAwait } from "../src/helpers.ts";

      Given("a step calling a helper", () => {
        callHelper();
      });

      Given("an async step", async () => {
        await throwAfterAwait();
      });
      """
    And a file named "features/stack.feature" with:
      """
      Feature: Stack
        Scenario: calling a helper
          Given a step calling a helper

        Scenario: after an await
          Given an async step
      """
    And a file named "tests/native.test.ts" with:
      """
      import { test } from "vitest";
      import { callHelper, throwAfterAwait } from "../src/helpers.ts";

      test("calling a helper", () => {
        callHelper();
      });

      test("after an await", async () => {
        await throwAfterAwait();
      });
      """

  # The user's own `onStackTrace` applies first, the plugin's filter after it (both modes: the browser
  # server copies the option as Vitest resolves it, so the plugin merges it in its `config` hook).
  Scenario Outline: The user's own onStackTrace leaves out frames, the plugin's filter still applies (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          include: ["features/**/*.feature"],
          onStackTrace: (_error: unknown, frame: { file: string }) =>
            !frame.file.includes("src/helpers.ts"),
          browser: {
            enabled: <browser>,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
        },
      };
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      TypeError: thrown in a helper
       ❯ features/stack.feature:3:5
      """
    And the output contains:
      """
      features/steps.ts:5
      """
    And the output doesn't contain:
      """
      src/helpers.ts
      """
    And the output doesn't contain:
      """
      node_modules/@cucumber
      """

    Examples:
      | mode      | browser |
      | node      | false   |
      | browser   | true    |
      | storybook | true    |

  # The feature files and the plain tests in projects of their own (the plugin's project's files
  # are all feature files), in the same engine (in storybook mode, the plugin's project the addon's:
  # its feature files' stories, in Chromium).
  Scenario Outline: A step's frames are the ones Vitest prints for a plain test (<mode>)
    Given the worker's kept Vitests are closed
    And the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";
      import { defineConfig } from "vitest/config";

      // A new one for each project: Vitest names its instances in place.
      const browser = () => ({
        enabled: <browser>,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "<instance>" as const }],
        screenshotFailures: false,
      });

      export default defineConfig({
        test: {
          projects: [
            {
              plugins: [cucumber({ import: ["features/**/*.ts"] })],
              test: { name: "features", include: ["features/**/*.feature"], browser: browser() },
            },
            { test: { name: "tests", include: ["tests/**/*.test.ts"], browser: browser() } },
          ],
        },
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And each scenario's frames in "src/helpers.ts" are its plain test's:
      | SCENARIO                 | TEST             | STEP                     |
      | Stack > calling a helper | calling a helper | features/stack.feature:3 |
      | Stack > after an await   | after an await   | features/stack.feature:6 |

    Examples:
      | mode      | browser | instance |
      | node      | false   | chromium |
      | browser   | true    | chromium |
      | firefox   | true    | firefox  |
      | webkit    | true    | webkit   |
      | storybook | true    | chromium |
