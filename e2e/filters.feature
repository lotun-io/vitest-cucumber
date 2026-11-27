Feature: Vitest picks the scenarios
  Every scenario is a Vitest test, in a suite per feature, rule and scenario outline, at its
  Gherkin line: Vitest's filters pick the ones it runs, and cucumber reports those only.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: first
          Given a passing step

        @smoke
        Scenario: second
          Given a passing step

        Rule: outlines
          Scenario Outline: example <n>
            Given a passing step

            Examples:
              | n |
              | 1 |
              | 2 |
      """

  Scenario Outline: A line picks its scenario (<mode>)
    When I run vitest in <mode> mode with "features/a.feature:9"
    Then it passes
    And it runs the scenarios:
      | NAME   | STATUS |
      | second | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A scenario outline's line picks its examples, an example's line that example (<mode>)
    When I run vitest in <mode> mode with "features/a.feature:13 features/a.feature:18"
    Then it passes
    And it runs the scenarios:
      | NAME      | STATUS |
      | example 1 | passed |
      | example 2 | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A line without a scenario is an error, as for any Vitest test file (<mode>)
    When I run vitest in <mode> mode with "features/a.feature:99"
    Then it fails
    And the output contains:
      """
      No test found in features/a.feature in line 99
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Gherkin tags are Vitest tags (<mode>)
    When I run vitest in <mode> mode with options:
      """
      { "tagsFilter": ["@smoke"] }
      """
    Then it passes
    And it runs the scenarios:
      | NAME   | STATUS |
      | second | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A tag written `@tag(<name>)` is the tag `<name>` in every mode: Vitest's tag filter names it
  # (`slow`, no `@`), and so does a cucumber hook's tag expression (the scenario's pickle has it).
  Scenario Outline: A tag written `@tag(<name>)` is that name, for Vitest and for cucumber (<mode>)
    Given a file named "features/hooks.ts" with:
      """
      import { Before, Then } from "@cucumber/cucumber";

      Before({ tags: "slow" }, (world: { slow?: boolean }) => {
        world.slow = true;
      });
      Then("the hook tagged slow ran", (world: { slow?: boolean }) => {
        if (!world.slow) {
          throw new Error("the hook tagged slow didn't run");
        }
      });
      """
    And a file named "features/tagged.feature" with:
      """
      Feature: Tagged
        Background:
          Given the stories of "./tagged.stories.tsx"
          And the "default" story
        @tag(slow)
        Scenario: slow
          Then the hook tagged slow ran
      """
    When I run vitest in <mode> mode with options:
      """
      { "tagsFilter": ["slow"] }
      """
    Then it passes
    And it runs the scenarios:
      | NAME | STATUS |
      | slow | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # In a Storybook project a tag a scenario takes off (`@tag(!fast)`, after its feature's
  # `@tag(fast)`) is Storybook's: its story isn't `fast`, and its test has neither `fast` nor
  # `!fast`, so a filter on `fast` leaves it out; the feature's other scenario keeps the tag.
  Scenario: A tag a scenario takes off isn't its test's tag either (storybook)
    Given a file named "features/fast.feature" with:
      """
      @tag(fast)
      Feature: Fast
        Background:
          Given the stories of "./fast.stories.tsx"
          And the "default" story
        Scenario: kept
          Given a passing step

        @tag(!fast)
        Scenario: taken off
          Given a passing step
      """
    When I run vitest in storybook mode with options:
      """
      { "tagsFilter": ["fast"] }
      """
    Then it passes
    And it runs the scenarios:
      | NAME | STATUS |
      | kept | passed |

  # Vitest fails a run whose tag filter names a tag it doesn't know ("The tag pattern … is not
  # defined in the configuration"): every feature file's tags are declared, not only the run's
  # files', so a filter naming another file's tag skips this file's scenarios.
  Scenario Outline: A tag filter may name a tag of a feature file outside the run (<mode>)
    Given a file named "features/b.feature" with:
      """
      Feature: B
        Background:
          Given the stories of "./b.stories.tsx"
          And the "default" story
        @other
        Scenario: third
          Given a passing step
      """
    When I run vitest in <mode> mode with "features/a.feature" and options:
      """
      { "tagsFilter": ["@other"] }
      """
    Then it passes
    And it runs no scenarios
    And the output doesn't contain:
      """
      is not defined in the configuration
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A test is named after its scenario (or an Outline row), in every mode: a pattern on that name
  # picks it.
  Scenario Outline: Vitest's test name pattern matches a scenario's name (<mode>)
    When I run vitest in <mode> mode with options:
      """
      { "testNamePattern": "second|example 2" }
      """
    Then it passes
    And it runs the scenarios:
      | NAME      | STATUS |
      | second    | passed |
      | example 2 | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Vitest's test name pattern matches the feature's, rule's and scenario's names (<mode>)
    When I run vitest in <mode> mode with options:
      """
      { "testNamePattern": "A > outlines" }
      """
    Then it passes
    And it runs the scenarios:
      | NAME      | STATUS |
      | example 1 | passed |
      | example 2 | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
