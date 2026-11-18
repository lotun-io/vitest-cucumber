Feature: Retries
  Vitest retries a scenario's test (`retry`, also per Gherkin tag with `test.tags`): each retry is a
  run of its own (the plugin never sets cucumber's `retry`), whatever failed it.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      let attempts = 0;
      Given("a step that passes on its second attempt", () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error(`Attempt ${attempts} failed`);
        }
      });
      Given("a failing step", () => {
        throw new Error("Step failed intentionally");
      });
      """

  Scenario Outline: A scenario that passes when retried passes (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: flaky
          Given a step that passes on its second attempt
      """
    When I run vitest in <mode> mode with options:
      """
      { "retry": 1 }
      """
    Then it passes
    And it runs the scenarios:
      | NAME  | STATUS |
      | flaky | passed |
    And the scenario "flaky" is attempted 2 times

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A scenario that fails every attempt fails, with its last attempt's error (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a failing step
      """
    When I run vitest in <mode> mode with options:
      """
      { "retry": 2 }
      """
    Then it fails
    And the scenario "failing" is attempted 3 times
    And the scenario "failing" fails with:
      """
      Step failed intentionally
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Without retries, a scenario is attempted once (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: flaky
          Given a step that passes on its second attempt
      """
    When I run vitest in <mode> mode
    Then it fails
    And the scenario "flaky" is attempted 1 time

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A Gherkin tag's Vitest definition retries its scenarios (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          include: ["features/**/*.feature"],
          tags: [{ name: "@flaky", retry: 1 }],
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
    And a file named "features/a.feature" with:
      """
      Feature: A
        @flaky
        Scenario: tagged
          Given a step that passes on its second attempt

        Scenario: untagged
          Given a step that fails on its first attempt
      """
    And a file named "features/more.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      let attempts = 0;
      Given("a step that fails on its first attempt", () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error(`Attempt ${attempts} failed`);
        }
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME         | STATE  |
      | A > tagged   | passed |
      | A > untagged | failed |
    And the scenario "tagged" is attempted 2 times
    And the scenario "untagged" is attempted 1 time

    Examples:
      | mode      | browser |
      | node      | false   |
      | browser   | true    |
      | storybook | true    |

  # As cucumber: only a failed scenario is retried, not one with an undefined, pending or ambiguous
  # step (its `willBeRetried` false). Vitest still runs every attempt its `retry` allows: a later one
  # fails with the first one's error, nothing run (its messages: one attempt, as cucumber's).
  Scenario Outline: A scenario with an undefined or pending step isn't retried, as in cucumber (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a pending step", () => "pending");
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: undefined
          Given a step nobody wrote

        Scenario: pending
          Given a pending step
      """
    And the run's messages are collected
    When I run vitest in <mode> mode with options:
      """
      { "retry": 2 }
      """
    Then it fails
    And the scenario "undefined" is attempted 3 times
    And the scenario "pending" is attempted 3 times
    And in the stream, the attempts are:
      | SCENARIO  | ATTEMPT | RETRIED |
      | undefined | 0       | false   |
      | pending   | 0       | false   |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
