Feature: Listing the scenarios without running them

  # `vitest list` as Vitest's command line runs it by default: it parses each test file's module
  # without running it, and finds the calls it declares its tests with. A feature module writes its
  # test tree as such calls, each at its Gherkin line (its source map), so every scenario and example
  # row is listed at its line, and Vitest's filters apply: a `file:line`, a tag.
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
      | mode    |
      | node    |
      | browser |
