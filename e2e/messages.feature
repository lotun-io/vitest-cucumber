Feature: Messages
  Each Vitest run (not in watch mode) is one stream of Cucumber Messages, as cucumber's own run would
  be (`compatibility/` compares them with cucumber's), for a subscriber in main (the harness's: no
  public API): its `meta` first (a placeholder), every feature file once, its
  `testRunFinished` last (Vitest's verdict of the run), every message of the run its
  `testRunStartedId`, every project's in it (a worker's id names its project). Workers and pages send
  theirs to main (the support code's once), a failed result's text its error's own stack, as the
  runtime has it (no causes, no members: the compatibility kit compares neither).

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { AfterAll, BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => {});
      AfterAll(() => {});
      Given("a step", () => {});
      Given("a step that fails with a cause", () => {
        throw new Error("Step failed", { cause: new TypeError("the cause") });
      });
      Given("a step that fails with errors", () => {
        throw new AggregateError(
          [new Error("first error"), new RangeError("second error")],
          "Several failed",
        );
      });
      let attempts = 0;
      Given("a step that passes on its second attempt", () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error(`Attempt ${attempts} failed`);
        }
      });
      """

  Scenario Outline: A project's run is one stream, each failure's text its error's own stack (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passes
          Given a step

        Scenario: has a cause
          Given a step that fails with a cause

        Scenario: has errors
          Given a step that fails with errors

        Scenario: flaky
          Given a step that passes on its second attempt
      """
    And the run's messages are collected
    When I run vitest in <mode> mode with options:
      """
      { "retry": 1 }
      """
    Then it fails
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO    | WORKER   |
      | passes      | <worker> |
      | has a cause | <worker> |
      | has errors  | <worker> |
      | flaky       | <worker> |
    And in the stream, the run fails
    And in the stream, the scenario "has a cause" fails with:
      """
      Error: Step failed
      """
    And in the stream, the scenario "has errors" fails with:
      """
      AggregateError: Several failed
      """
    And in the stream, the attempts are:
      | SCENARIO    | ATTEMPT | RETRIED |
      | passes      | 0       | false   |
      | has a cause | 0       | true    |
      | has a cause | 1       | false   |
      | has errors  | 0       | true    |
      | has errors  | 1       | false   |
      | flaky       | 0       | true    |
      | flaky       | 1       | false   |
    And in the stream, the run's hooks are:
      | HOOK            | STATUS |
      | BEFORE_TEST_RUN | PASSED |
      | AFTER_TEST_RUN  | PASSED |

    Examples:
      | mode      | worker       |
      | node      | 1            |
      | browser   | 1 [chromium] |
      | storybook | 1 [chromium] |

  Scenario Outline: Several workers, one stream: the support code's messages once (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a passes
          Given a step
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: b passes
          Given a step
      """
    And the run's messages are collected
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 2 }
      """
    Then it passes
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO |
      | a passes |
      | b passes |
    And in the stream, the run's hooks are, in any order:
      | HOOK            | STATUS |
      | BEFORE_TEST_RUN | PASSED |
      | BEFORE_TEST_RUN | PASSED |
      | AFTER_TEST_RUN  | PASSED |
      | AFTER_TEST_RUN  | PASSED |

    Examples:
      | mode    |
      | node    |
      | browser |

  # A run Vitest fails without a failed step (here an error outside any test) fails as cucumber's would.
  Scenario Outline: An unhandled error fails the run (<mode>)
    Given a file named "features/outside.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step that throws outside it", async () => {
        setTimeout(() => {
          throw new Error("thrown outside the step");
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: throws outside
          Given a step that throws outside it
      """
    And the run's messages are collected
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 1 }
      """
    Then it fails
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO       |
      | throws outside |
    And in the stream, the run fails

    Examples:
      | mode    |
      | node    |
      | browser |

  # A feature file that fails to load (here its Gherkin) fails its test module: the stream has every
  # feature file, and fails.
  Scenario Outline: A feature file that fails to load fails the stream (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passes
          Given a step
      """
    And a file named "features/broken.feature" with:
      """
      Feature: Broken
        Scenario: broken
          Given a step
      not Gherkin
      """
    And the run's messages are collected
    When I run vitest in <mode> mode
    Then it fails
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO |
      | passes   |
    And in the stream, the run fails

    Examples:
      | mode    |
      | node    |
      | browser |

  # Vitest's run fails with an AfterAll hook's error (an unhandled error: the worker fixture's
  # cleanup's), so does the stream, as cucumber's run would.
  Scenario Outline: A failing AfterAll hook fails the run (<mode>)
    Given a file named "features/after.ts" with:
      """
      import { AfterAll } from "@cucumber/cucumber";

      AfterAll(() => {
        throw new Error("AfterAll failed");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passes
          Given a step
      """
    And the run's messages are collected
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 1 }
      """
    Then it fails
    And the stream's success is Vitest's
    And in the stream, the run fails
    And in the stream, the run's hooks are:
      | HOOK            | STATUS |
      | BEFORE_TEST_RUN | PASSED |
      | AFTER_TEST_RUN  | PASSED |
      | AFTER_TEST_RUN  | FAILED |

    Examples:
      | mode    |
      | node    |
      | browser |

  # One `cucumber()` in the root config, every project inheriting it (`extends: true`): one stream,
  # both projects' test cases in it, each worker named after its project.
  Scenario: One plugin shared by projects: one stream, every project's
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          projects: [
            {
              extends: true,
              test: { name: "in-node", include: ["features/node/**/*.feature"] },
            },
            {
              extends: true,
              test: {
                name: "in-browser",
                include: ["features/browser/**/*.feature"],
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright(),
                  instances: [{ browser: "chromium" }],
                  screenshotFailures: false,
                },
              },
            },
          ],
        },
      };
      """
    And a file named "features/node/a.feature" with:
      """
      Feature: Node
        Scenario: in node
          Given a step
      """
    And a file named "features/browser/b.feature" with:
      """
      Feature: Browser
        Scenario: in the browser
          Given a step
      """
    And the run's messages are collected
    When I run vitest
    Then it passes
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO       | WORKER                    |
      | in node        | 1 [in-node]               |
      | in the browser | 1 [in-browser (chromium)] |

  # A `cucumber()` per project, both running the same feature file: each plugin plans it with the
  # same ids, so the stream has it once, both projects' test cases on its pickles.
  Scenario: A plugin per project: one stream, each feature file once
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        test: {
          projects: [
            {
              plugins: [cucumber({ import: ["features/**/*.ts"] })],
              test: { name: "in-node", include: ["features/**/*.feature"] },
            },
            {
              plugins: [cucumber({ import: ["features/**/*.ts"] })],
              test: {
                name: "in-browser",
                include: ["features/**/*.feature"],
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright(),
                  instances: [{ browser: "chromium" }],
                  screenshotFailures: false,
                },
              },
            },
          ],
        },
      };
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: everywhere
          Given a step
      """
    And the run's messages are collected
    When I run vitest
    Then it passes
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO   | WORKER                    |
      | everywhere | 1 [in-node]               |
      | everywhere | 1 [in-browser (chromium)] |
    And each feature file is in the stream once, its pickles every test case's

  # A browser config's instances are projects of their own: both in the one stream, each named.
  Scenario: Several browsers: one stream, every browser's
    Given the worker's kept Vitests are closed
    And the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          include: ["features/**/*.feature"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }],
            screenshotFailures: false,
          },
        },
      };
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a passes
          Given a step
      """
    And the run's messages are collected
    When I run vitest
    Then it passes
    And the stream's success is Vitest's
    And the run's stream has the test cases:
      | SCENARIO | WORKER       |
      | a passes | 1 [chromium] |
      | a passes | 1 [firefox]  |
