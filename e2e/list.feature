Feature: Listing the scenarios without running them

  # `vitest list` as Vitest's command line runs it by default: it parses each test file's module
  # without running it, and finds the calls it declares its tests with. A feature's test module (in a
  # Storybook project, its stories module) writes its test tree as such calls, each at its Gherkin
  # line (its source map), so every scenario and example row is listed at its line, and Vitest's
  # filters apply: a `file:line`, a tag.
  Scenario Outline: vitest list finds every scenario and example row, at its line (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      Given("a step with {string}", (_item: string) => {});
      """
    And a file named "features/cart.feature" with:
      """
      @cart
      Feature: Cart

        Background:
          Given a step

        @smoke
        Scenario: Adding an item
          Given a step

        Rule: Discounts

          Scenario Outline: A coupon
            Given a step with "<item>"

            Examples:
              | item   |
              | apples |
              | pears  |
      """
    When I list its tests in <mode> mode
    Then it lists the tests:
      | NAME                                   | LOCATION                   |
      | Cart > Adding an item                  | features/cart.feature:8:3  |
      | Cart > Discounts > A coupon > A coupon | features/cart.feature:18:9 |
      | Cart > Discounts > A coupon > A coupon | features/cart.feature:19:9 |
    When I list its tests in <mode> mode with "features/cart.feature:19"
    Then it lists the tests:
      | NAME                                   | LOCATION                   |
      | Cart > Discounts > A coupon > A coupon | features/cart.feature:19:9 |
    When I list its tests in <mode> mode with options:
      """
      { "tagsFilter": ["@smoke"] }
      """
    Then it lists the tests:
      | NAME                  | LOCATION                  |
      | Cart > Adding an item | features/cart.feature:8:3 |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # `vitest list --staticParse=false` (the API's `collectTests`): each feature file's module is
  # imported in a worker or a page, where it declares its tests, and none runs. Nothing of cucumber
  # runs either: the support code loads as a file runs, so no hook runs and a support file isn't
  # even imported. Here it throws as it's imported: a run fails with it, collecting doesn't. A tag
  # of another feature file is declared too (as the project is set up: no run starts), so it's no
  # error as a filter.
  Scenario Outline: Collecting the tests finds them at their lines, and loads no support code (<mode>)
    Given a file named "features/steps.ts" with:
      """
      throw new Error("The support code was loaded");
      """
    And a file named "features/cart.feature" with:
      """
      Feature: Cart

        @smoke
        Scenario: Adding an item
          Given a step

        Rule: Discounts

          Scenario Outline: A coupon
            Given a step with "<item>"

            Examples:
              | item   |
              | apples |
              | pears  |
      """
    And a file named "features/other.feature" with:
      """
      Feature: Other

        @other
        Scenario: Another
          Given a step
      """
    When I collect its tests in <mode> mode with "features/cart.feature"
    Then it lists the tests:
      | NAME                                   | LOCATION                   |
      | Cart > Adding an item                  | features/cart.feature:4:3  |
      | Cart > Discounts > A coupon > A coupon | features/cart.feature:14:9 |
      | Cart > Discounts > A coupon > A coupon | features/cart.feature:15:9 |
    When I collect its tests in <mode> mode with "features/cart.feature" and options:
      """
      { "tagsFilter": ["@smoke"] }
      """
    Then it lists the tests:
      | NAME                  | LOCATION                  |
      | Cart > Adding an item | features/cart.feature:4:3 |
    When I collect its tests in <mode> mode with "features/cart.feature" and options:
      """
      { "tagsFilter": ["@other"] }
      """
    Then it lists the tests:
      | NAME | LOCATION |
    When I run vitest in <mode> mode with "features/cart.feature"
    Then it fails
    And the output contains:
      """
      The support code was loaded
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
