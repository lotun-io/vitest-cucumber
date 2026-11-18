Feature: Summaries
  Every kind of failure a summary or a snippet is printed for: each scenario fails on purpose, so
  it's left out (see `vitest.config.ts`) unless the command names `features/fail/`:

  pnpm test --project node features/fail/summaries.feature

  Scenario: An undefined step
    Given a value of 10
    When I triple it

  Scenario: An undefined step with numbers, a string and a word
    Given a total of 3 apples at 1.5 each named "red" today

  Scenario: Several undefined steps
    Given a value of 10
    When I triple it
    And I halve it
    Then the value should be 15

  Scenario: An undefined step with a doc string
    Given a note:
      """
      Some text
      """

  Scenario: An undefined step with a data table
    Given these totals:
      | a | 1 |
      | b | 2 |

  Scenario: An ambiguous step
    Given an ambiguous summary step

  Scenario: A pending step
    Given a pending summary step

  Scenario: A pending step with an attachment
    Given a pending summary step with an attachment

  Scenario: A missing parameter type
    Given a vanilla flavor

  Scenario: Several missing parameter types
    Given a vanilla flavor
    And a chocolate topping on 2 vanilla scoops
    And a large cup of apple juice

  # `fruit` is defined (apple or banana): no step could use `size`, nothing listed.
  Scenario: A missing parameter type no step could use
    Given a large cup of mango juice

  Scenario: A missing parameter type, with pending, undefined and ambiguous steps
    Given a pending summary step
    And a vanilla flavor
    When I triple it
    Then an ambiguous summary step

  Scenario Outline: A missing parameter type in an example (<order>)
    Given a <order>

    Examples:
      | order                    |
      | tub of vanilla to go     |
      | large cup of mango juice |

  Scenario: A pending step, then an undefined one
    Given a pending summary step
    When I triple it

  Scenario: An undefined step, then an ambiguous one
    When I triple it
    Then an ambiguous summary step

  Scenario: A failing step, then an undefined one
    Given a value of 1
    Then the value should be 2
    And I triple it

  @summaryFailBefore
  Scenario: A failing Before hook
    Given a value of 1

  @summaryFailAfter
  Scenario: A failing After hook
    Given a value of 1

  Scenario Outline: An undefined step in an example (<n>)
    Given a value of <n>
    When I multiply it by <n>

    Examples:
      | n |
      | 2 |
      | 3 |

  Rule: A rule with a background

    Background:
      Given an undefined background step

    Scenario: An undefined background step
      Given a value of 1
