Feature: Hooks

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { After, Before, Given, Status } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a failing step", () => {
        throw new Error("Step failed intentionally");
      });

      Before({ tags: "@skip" }, () => "skipped");

      After({ tags: "@rewrite" }, (hook) => {
        if (hook.result) {
          hook.result.status = Status.PASSED;
        }
      });
      """

  Scenario Outline: A Before hook returning "skipped" skips its scenario, and its test (<mode>)
    Given a file named "features/skip.feature" with:
      """
      Feature: Skip
        Scenario: runs
          Given a passing step

        @skip
        Scenario: skipped
          Given a failing step

        @skip
        Scenario Outline: skipped outline <n>
          Given a failing step

          Examples:
            | n |
            | 1 |
            | 2 |

        Rule: A rule

          @skip
          Scenario: skipped in a rule
            Given a failing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And the feature file "features/skip.feature" passes
    And it runs the scenarios:
      | NAME              | STATUS  |
      | runs              | passed  |
      | skipped           | skipped |
      | skipped outline 1 | skipped |
      | skipped outline 2 | skipped |
      | skipped in a rule | skipped |
    And Vitest reports the tests:
      | NAME                                           | STATE   |
      | Skip > runs                                    | passed  |
      | Skip > skipped                                 | skipped |
      | Skip > skipped outline <n> > skipped outline 1 | skipped |
      | Skip > skipped outline <n> > skipped outline 2 | skipped |
      | Skip > A rule > skipped in a rule              | skipped |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's status of a scenario is its worst step or hook result: a skip is the scenario's, whatever
  # passed before or after it (the compatibility kit's `hooks-skipped` and `skipped`).
  Scenario Outline: A step or hook returning "skipped" skips its scenario, whatever passed around it (<mode>)
    Given a file named "features/skipping.ts" with:
      """
      import { After, Before, Given } from "@cucumber/cucumber";

      Before(() => {});
      Before({ tags: "@skipBefore" }, () => "skipped");
      After(() => {});
      After({ tags: "@skipAfter" }, () => "skipped");
      Given("a step that skips", () => "skipped");
      """
    And a file named "features/skip.feature" with:
      """
      Feature: Skip
        Scenario: from a step
          Given a passing step
          And a step that skips

        @skipBefore
        Scenario: from a Before hook
          Given a passing step

        @skipAfter
        Scenario: from an After hook
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME               | STATUS  |
      | from a step        | skipped |
      | from a Before hook | skipped |
      | from an After hook | skipped |
    And Vitest reports the tests:
      | NAME                      | STATE   |
      | Skip > from a step        | skipped |
      | Skip > from a Before hook | skipped |
      | Skip > from an After hook | skipped |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # As in cucumber's parallel mode: the run's outcome is the rewritten result.
  Scenario Outline: An After hook rewriting a failed result passes the run, as in cucumber's parallel mode (<mode>)
    Given a file named "features/rewrite.feature" with:
      """
      Feature: Rewrite
        @rewrite
        Scenario: rewritten
          Given a failing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And the feature file "features/rewrite.feature" passes
    And it runs the scenarios:
      | NAME      | STATUS |
      | rewritten | passed |
    And Vitest reports the tests:
      | NAME                | STATE  |
      | Rewrite > rewritten | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # An After hook's changed `result` stays as it is: cucumber never reads a getter the hook added
  # (a throwing one), so the scenario passes, in both modes (browser mode runs cucumber's runtime
  # in the page, which copies nothing).
  Scenario Outline: An After hook's result with a throwing getter is kept as it is (<mode>)
    Given a file named "features/uncopyable.ts" with:
      """
      import { After } from "@cucumber/cucumber";

      After({ tags: "@uncopyable" }, (hook) => {
        Object.defineProperty(hook.result, "extra", {
          enumerable: true,
          get() {
            throw new Error("Getter failed intentionally");
          },
        });
      });
      """
    And a file named "features/uncopyable.feature" with:
      """
      Feature: Uncopyable
        @uncopyable
        Scenario: an uncopyable result
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then Vitest reports the tests:
      | NAME                              | STATE   |
      | Uncopyable > an uncopyable result | <state> |
    And the output <getter>:
      """
      Error: Getter failed intentionally
      """

    Examples:
      | mode    | state  | getter          |
      | node    | passed | doesn't contain |
      | browser | passed | doesn't contain |

  # An AfterStep hook's rewrite of its step's result is the step's, as in cucumber (serial or
  # parallel): the step passes, and the next one runs (a skipped one would skip the scenario).
  Scenario Outline: An AfterStep hook rewriting a failed step's result passes it, and the next step runs (<mode>)
    Given a file named "features/rewriteStep.ts" with:
      """
      import { AfterStep, Status } from "@cucumber/cucumber";

      AfterStep({ tags: "@rewriteStep" }, ({ result }) => {
        result.status = Status.PASSED;
      });
      """
    And a file named "features/rewrite.feature" with:
      """
      Feature: Rewrite
        @rewriteStep
        Scenario: rewritten step
          Given a failing step
          And a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And Vitest reports the tests:
      | NAME                     | STATE  |
      | Rewrite > rewritten step | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's step hooks: each BeforeStep and AfterStep around every step, their World the
  # scenario's, an AfterStep's argument the step's result; tagged ones only for their scenarios.
  Scenario Outline: BeforeStep and AfterStep hooks run around each step (<mode>)
    Given a file named "features/stepHooks.ts" with:
      """
      import { AfterStep, BeforeStep, Given, setWorldConstructor, World } from "@cucumber/cucumber";

      class Events extends World {
        events: string[] = [];
      }
      setWorldConstructor(Events);
      BeforeStep(function (this: Events) {
        this.events.push("before");
      });
      AfterStep(function (this: Events, { result }) {
        this.events.push(`after ${result.status}`);
      });
      BeforeStep({ tags: "@tagged" }, function (this: Events) {
        this.events.push("tagged");
      });
      Given("a recording step", function (this: Events) {
        this.events.push("step");
      });
      Given("the events are {string}", function (this: Events, expected: string) {
        if (this.events.join(", ") !== expected) {
          throw new Error(`events: ${this.events.join(", ")}`);
        }
      });
      """
    And a file named "features/stepHooks.feature" with:
      """
      Feature: Step hooks
        Scenario: untagged
          Given a recording step
          Then the events are "before, step, after PASSED, before"

        @tagged
        Scenario: tagged
          Given a recording step
          Then the events are "before, tagged, step, after PASSED, before, tagged"
      """
    When I run vitest in <mode> mode
    Then it passes
    And Vitest reports the tests:
      | NAME                  | STATE  |
      | Step hooks > untagged | passed |
      | Step hooks > tagged   | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A failing step hook fails its scenario, its error the test's (`a passing step`: the Background's).
  Scenario Outline: A failing BeforeStep or AfterStep hook fails its scenario, with its error (<mode>)
    Given a file named "features/stepHooks.ts" with:
      """
      import { AfterStep, BeforeStep } from "@cucumber/cucumber";

      BeforeStep({ tags: "@before" }, () => {
        throw new Error("BeforeStep failed");
      });
      AfterStep({ tags: "@after" }, () => {
        throw new Error("AfterStep failed");
      });
      """
    And a file named "features/stepHooks.feature" with:
      """
      Feature: Step hooks
        @before
        Scenario: before
          Given a passing step

        @after
        Scenario: after
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Step hooks > before" fails with:
      """
      BeforeStep failed
      """
    And the test "Step hooks > after" fails with:
      """
      AfterStep failed
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
