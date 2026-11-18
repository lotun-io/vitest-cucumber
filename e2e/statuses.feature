Feature: Scenario statuses
  An undefined, pending or ambiguous step fails its scenario, as in cucumber (strict): its test
  fails with the step's text, caused by cucumber's summary of the scenario, under its status's
  heading (with the snippets for its undefined steps).

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a pending step", () => "pending");
      Given("an ambiguous step", () => {});
      Given(/^an ambiguous step$/, () => {});
      """

  Scenario Outline: A step without a definition is undefined, and fails the run (<mode>)
    Given a file named "features/undefined.feature" with:
      """
      Feature: Undefined
        Scenario: undefined step
          Given a step nobody defined
      """
    When I run vitest in <mode> mode
    Then it fails
    And the feature file "features/undefined.feature" fails
    And it runs the scenarios:
      | NAME           | STATUS    |
      | undefined step | undefined |
    And the test "Undefined > undefined step" fails with:
      """
      Given a step nobody defined

      Undefined steps:
        Given a step nobody defined

      You can implement missing steps with the snippets below:

      Given('a step nobody defined', function () {
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The summary's colors are Vitest's: main asks Vitest's printer, and the worker or the page gets the
  # answer. So the error has colors exactly when Vitest's output has (a terminal, `FORCE_COLOR=1`),
  # whichever way the suite runs (CI, an agent: none).
  Scenario Outline: An undefined step's summary has Vitest's colors (<mode>)
    Given a file named "features/undefined.feature" with:
      """
      Feature: Undefined
        Scenario: undefined step
          Given a step nobody defined
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Undefined > undefined step" has colors in its error as Vitest's output has

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Pending and ambiguous steps fail their scenarios (<mode>)
    Given a file named "features/statuses.feature" with:
      """
      Feature: Statuses
        Scenario: pending step
          Given a pending step

        Scenario: ambiguous step
          Given an ambiguous step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs the scenarios:
      | NAME           | STATUS    |
      | pending step   | pending   |
      | ambiguous step | ambiguous |
    And the test "Statuses > pending step" fails with:
      """
      Given a pending step
      """
    And the output contains:
      """
      Pending steps:
        Given a pending step # features/steps.ts:4
      """
    And the test "Statuses > ambiguous step" fails with:
      """
      Given an ambiguous step
      """
    And the output contains:
      """
      Ambiguous steps:
        Given an ambiguous step
            Multiple matching step definitions found:
              • an ambiguous step # features/steps.ts:5
              • ^an ambiguous step$ # features/steps.ts:6
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Every section of a scenario's summary, each with two entries, in cucumber's order: the pending
  # steps (a step's and an After hook's: hooks run after a step that didn't pass), the undefined
  # ones, the ambiguous ones (a step after one that didn't pass is still undefined or ambiguous),
  # the missing parameter types, and the snippets.
  Scenario Outline: A scenario's summary lists every status, each of its steps (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After, Given } from "@cucumber/cucumber";

      Given("a pending step", () => "pending");
      Given("a {color} car", () => {});
      Given("a {size} box", () => {});
      Given("an ambiguous step", () => {});
      Given(/^an ambiguous step$/, () => {});
      Given("another ambiguous step", () => {});
      Given(/^another ambiguous step$/, () => {});
      After(() => "pending");
      """
    And a file named "features/a.feature" with:
      """
      Feature: Summary
        Scenario: every status
          Given a pending step
          And a red car
          And a big box
          And an ambiguous step
          And another ambiguous step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Summary > every status" fails with:
      """
      Given a pending step
      """
    And the output contains:
      """
      Pending steps:
        Given a pending step # features/steps.ts:3
        After # features/steps.ts:10

      Undefined steps:
        And a red car
        And a big box

      Ambiguous steps:
        And an ambiguous step
            Multiple matching step definitions found:
              • an ambiguous step # features/steps.ts:6
              • ^an ambiguous step$ # features/steps.ts:7
        And another ambiguous step
            Multiple matching step definitions found:
              • another ambiguous step # features/steps.ts:8
              • ^another ambiguous step$ # features/steps.ts:9

      These parameters are missing a parameter type definition:
        'color' in 'a {color} car'
        'size' in 'a {size} box'

      You can implement missing steps with the snippets below:

      Given('a red car', function () {
        // Write code here that turns the phrase above into concrete actions
        return 'pending';
      });

      Given('a big box', function () {
        // Write code here that turns the phrase above into concrete actions
        return 'pending';
      });
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Their steps are undefined; cucumber's summary formatter lists the missing types once for its run,
  # the plugin in the summary of each scenario with an undefined step that could use one.
  Scenario Outline: A parameter type without a definition fails the run (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a {color} car", () => {});
      Given("a passing step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: Parameter types
        Scenario: undefined type
          Given a red car

        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME                             | STATE  |
      | Parameter types > undefined type | failed |
      | Parameter types > passing        | passed |
    And the output contains:
      """
      These parameters are missing a parameter type definition:
        'color' in 'a {color} car'
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Nothing ties a missing type to a step (cucumber drops its definition): a scenario lists those
  # whose expression one of its undefined steps matches, the missing type matching anything.
  Scenario Outline: A scenario's summary leaves out the missing parameter types none of its steps could use (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a {color} car", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: Parameter types
        Scenario: unrelated undefined step
          Given a red bike
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      Undefined steps:
        Given a red bike
      """
    And the output doesn't contain:
      """
      These parameters are missing a parameter type definition:
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
