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
    When I run vitest in <mode> mode with "features/a.feature:6"
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
    When I run vitest in <mode> mode with "features/a.feature:10 features/a.feature:15"
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

  # Vitest fails a run whose tag filter names a tag it doesn't know ("The tag pattern … is not
  # defined in the configuration"): every feature file's tags are declared, not only the run's
  # files', so a filter naming another file's tag skips this file's scenarios.
  Scenario Outline: A tag filter may name a tag of a feature file outside the run (<mode>)
    Given a file named "features/b.feature" with:
      """
      Feature: B
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

  # A story test is named after its story, the scenario's name (or an Outline row's), with no suites
  # around it: a pattern on that name picks it in every mode.
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
      | mode    |
      | node    |
      | browser |
