Feature: Errors before the run

  Scenario Outline: A feature file cucumber can't parse fails the run (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: broken
          Given a step
          This is not a step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs no scenarios
    And the output contains:
      """
      [@lotun/vitest-cucumber] feature file can't be parsed
      """
    And the output contains:
      """
        - expected: #EOF, #TableRow, #DocStringSeparator, #StepLine, #TagLine, #ExamplesLine, #ScenarioLine, #RuleLine, #Comment, #Empty, got 'This is not a step'
          features/a.feature:7:5
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
        Background:
          Given the stories of "./broken.stories.tsx"
          And the "default" story
        Scenario: broken
          Given a step
          This is not a step
      """
    And a file named "features/good.feature" with:
      """
      Feature: Good
        Background:
          Given the stories of "./good.stories.tsx"
          And the "default" story
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
      [@lotun/vitest-cucumber] feature file can't be parsed
      """
    And the output contains:
      """
          features/broken.feature:7:5
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

  # Cucumber's checks refuse it as the support code is built: the plugin's error (what's wrong, then
  # the definition's location on a line of its own, no stack), its feature files fail with it. A
  # page only records the call: main locates it, so the location is the user's line in every mode.
  Scenario Outline: A step definition cucumber refuses fails its feature files, with its location (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a step without code", "not a function" as never);
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
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
      [@lotun/vitest-cucumber] Given's second argument should be an object or a function
        features/steps.ts:4
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's methods the plugin doesn't support, recorded as the definitions are, refused as the
  # support code is built: `setDefaultTimeout` (Vitest's timeouts are the defaults),
  # `setParallelCanAssign` (Vitest assigns the feature files). The plugin's error, with what to use
  # instead and the call's location.
  Scenario Outline: A cucumber method the plugin doesn't support fails its feature files, with its location (<mode>: <method>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, setDefaultTimeout, setParallelCanAssign } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      <code>
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
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
      [@lotun/vitest-cucumber] <method> isn't supported, <instead>
        features/steps.ts:4
      """

    Examples:
      | mode      | method               | code                              | instead                                                       |
      | node      | setDefaultTimeout    | setDefaultTimeout(1000);          | Vitest's testTimeout and hookTimeout are the default timeouts |
      | node      | setParallelCanAssign | setParallelCanAssign(() => true); | Vitest assigns the feature files to its workers               |
      | browser   | setDefaultTimeout    | setDefaultTimeout(1000);          | Vitest's testTimeout and hookTimeout are the default timeouts |
      | browser   | setParallelCanAssign | setParallelCanAssign(() => true); | Vitest assigns the feature files to its workers               |
      | storybook | setDefaultTimeout    | setDefaultTimeout(1000);          | Vitest's testTimeout and hookTimeout are the default timeouts |
      | storybook | setParallelCanAssign | setParallelCanAssign(() => true); | Vitest assigns the feature files to its workers               |

  # A BeforeAll or AfterAll hook on the coordinator (once per run): refused as cucumber's checks refuse
  # a definition (Vitest's workers run them), with what to use instead and its location.
  Scenario Outline: A BeforeAll hook on the coordinator fails its feature files, with what to use instead (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      BeforeAll({ on: "COORDINATOR" }, () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
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
      [@lotun/vitest-cucumber] BeforeAll({ on: "COORDINATOR" }) isn't supported, use Vitest's globalSetup for once-per-run setup
        features/steps.ts:4
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
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: formatting
          Given a step using a formatter
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "A > formatting" fails with:
      """
      [@lotun/vitest-cucumber] Formatter isn't supported
      """

    Examples:
      | mode      |
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
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
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
      Error: [@lotun/vitest-cucumber] the support code failed to load
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
