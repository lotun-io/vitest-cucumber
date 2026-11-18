Feature: Errors before the run

  Scenario Outline: A feature file cucumber can't parse fails the run (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: broken
          Given a step
          This is not a step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs no scenarios
    And the output contains:
      """
      @lotun/vitest-cucumber: Parse error in features/a.feature
      """
    And the output contains:
      """
      (4:5): expected:
      """
    # The file's own error in every mode (a page's import isn't what fails: no Vitest wrapper).
    And the output doesn't contain:
      """
      Failed to import test file
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The run is of the others (cucumber's wouldn't start with it): they run as without it.
  Scenario Outline: A feature file cucumber can't parse fails, the others run (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      """
    And a file named "features/broken.feature" with:
      """
      Feature: Broken
        Scenario: broken
          Given a step
          This is not a step
      """
    And a file named "features/good.feature" with:
      """
      Feature: Good
        Scenario: passing
          Given a step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the feature file "features/broken.feature" fails
    And the feature file "features/good.feature" passes
    And it runs the scenarios:
      | NAME    | STATUS |
      | passing | passed |
    And the output contains:
      """
      @lotun/vitest-cucumber: Parse error in features/broken.feature
      """
    And the output contains:
      """
      (4:5): expected:
      """
    # The file's own error in every mode (a page's import isn't what fails: no Vitest wrapper).
    And the output doesn't contain:
      """
      Failed to import test file
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber refuses it as it's defined: its error, as the support code's (its feature files fail),
  # cucumber's message as it is (its location first: the definition's, with the platform's separator,
  # as native cucumber writes it).
  Scenario Outline: A step definition cucumber refuses fails its feature files, with cucumber's error (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a step without code", "not a function" as never);
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME        | STATE   |
      | A > passing | skipped |
    And the feature file "features/a.feature" fails
    And the output contains:
      """
      features/steps.ts:4: Invalid second argument: should be a object or function
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's methods the plugin doesn't support throw at the call, as the support code loads:
  # `setDefaultTimeout` (Vitest's timeouts are the defaults), `setParallelCanAssign` (Vitest assigns
  # the feature files). The support code's error, theirs its cause, its frames at the call.
  Scenario Outline: A cucumber method the plugin doesn't support fails its feature files, at its call (<mode>: <method>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, setDefaultTimeout, setParallelCanAssign } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      <code>
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME        | STATE   |
      | A > passing | skipped |
    And the feature file "features/a.feature" fails
    And the output contains:
      """
      Caused by: Error: @lotun/vitest-cucumber: <method> isn't supported
      """
    And the output contains:
      """
      features/steps.ts:4:
      """

    Examples:
      | mode      | method               | code                              |
      | node      | setDefaultTimeout    | setDefaultTimeout(1000);          |
      | node      | setParallelCanAssign | setParallelCanAssign(() => true); |
      | browser   | setDefaultTimeout    | setDefaultTimeout(1000);          |
      | browser   | setParallelCanAssign | setParallelCanAssign(() => true); |
      | storybook | setDefaultTimeout    | setDefaultTimeout(1000);          |
      | storybook | setParallelCanAssign | setParallelCanAssign(() => true); |

  # A BeforeAll or AfterAll hook on the coordinator (once per run): a validation error in cucumber's
  # form (its location first), as cucumber refuses a definition: Vitest's workers run them.
  Scenario Outline: A BeforeAll hook on the coordinator fails its feature files, with a validation error (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      BeforeAll({ on: "COORDINATOR" }, () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME        | STATE   |
      | A > passing | skipped |
    And the feature file "features/a.feature" fails
    And the output contains:
      """
      features/steps.ts:4: Invalid "options.on": "COORDINATOR" isn't supported, BeforeAll and AfterAll hooks run in each Vitest worker
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # In a page, cucumber's runner's and formatters' exports: the page has no cucumber runtime to give
  # them (node mode's worker has cucumber's own); importing one works, using it fails with the
  # plugin's error.
  Scenario Outline: In a page, an export of cucumber's runner fails where it's used (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Formatter, Given } from "@cucumber/cucumber";

      Given("a step using a formatter", () => {
        new Formatter({} as never);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: formatting
          Given a step using a formatter
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "A > formatting" fails with:
      """
      @lotun/vitest-cucumber: Formatter isn't supported
      """

    Examples:
      | mode      |
      | browser   |
      | storybook |

  # In node mode, cucumber refuses it in the user's call: its frames end at the user's line. A page
  # only records the call: main's replay refuses it, and `describe` answers with the error at the
  # call's place (not as a failed command: Vitest's page would give it the page's stack).
  Scenario Outline: A step definition cucumber refuses fails at its own line (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a step without code", "not a function" as never);
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      features/steps.ts:4:1
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The plugin's error, the support code's as its cause (its frames at the support file's line):
  # each feature file fails with it.
  Scenario Outline: Support code that throws as it's imported fails its feature files (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      throw new Error("Support code failed to load");
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME        | STATE   |
      | A > passing | skipped |
    And the feature file "features/a.feature" fails
    And the output contains:
      """
      Error: @lotun/vitest-cucumber: the support code failed to load
      """
    And the output contains:
      """
      Caused by: Error: Support code failed to load
      """
    And the output contains:
      """
      ❯ features/steps.ts:3:7
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
