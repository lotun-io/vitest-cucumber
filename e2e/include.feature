Feature: Feature files

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: in features
          Given a passing step
      """
    And a file named "specs/b.feature" with:
      """
      Feature: B
        Scenario: in specs
          Given a passing step
      """

  # `include` is the project's feature files: without it, Vitest's own default (`*.test.ts`, …).
  Scenario Outline: Without its own include, Vitest finds no feature files (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
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
    When I run vitest
    Then it fails
    And it runs no scenarios
    And the output contains:
      """
      No test files found
      """

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  Scenario Outline: A project's own include replaces it (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
          include: ["specs/**/*.feature"],
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
    When I run vitest
    Then it passes
    And it runs the scenarios:
      | NAME     | STATUS |
      | in specs | passed |

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  Scenario Outline: Every file the project includes is a feature file, whatever its extension: e.g. Markdown, with its tags (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
          include: ["features/**/*.feature", "features/**/*.feature.md"],
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
    And a file named "features/c.feature.md" with:
      """
      # Feature: C

      `@markdown`
      ## Scenario: in markdown

      * Given a passing step
      """
    When I run vitest
    Then it passes
    And Vitest reports the tests:
      | NAME            | STATE  |
      | A > in features | passed |
      | C > in markdown | passed |

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  # The plugin takes only feature files (`.feature`, `.feature.md`): the project's other test files
  # are Vitest's own, so feature files and unit tests can share a project.
  Scenario Outline: A test file that isn't a feature runs as Vitest's own (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
          include: ["features/**/*.feature", "specs/**/*.test.ts"],
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
    And a file named "specs/unit.test.ts" with:
      """
      import { expect, test } from "vitest";

      test("adds", () => {
        expect(1 + 1).toBe(2);
      });
      """
    When I run vitest
    Then it passes
    And Vitest reports the tests:
      | NAME            | STATE  |
      | A > in features | passed |
      | adds            | passed |

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  # Cucumber's paths are globs (a name starting with `@` a rerun file): the plugin parses the file
  # itself (see `src/core/feature/plan.ts`), so its name is its own, whatever it has in it, e.g. Next.js's `[id]` folders (not a `?`: Vite reads it as a module id's query). Each scenario
  # runs alone: its line still picks it.
  Scenario Outline: A feature file's path is its own, whatever its characters (<mode>, <name>)
    Given a file named "features/<name>" with:
      """
      Feature: Odd
        Scenario: passing
          Given a passing step

        Scenario: failing
          Given a failing step
      """
    And a file named "features/failing.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a failing step", () => {
        throw new Error("Step failed intentionally");
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME            | STATE  |
      | A > in features | passed |
      | Odd > passing   | passed |
      | Odd > failing   | failed |

    Examples:
      | mode    | name                  |
      | node    | [id]/item (1).feature |
      | browser | [id]/item (1).feature |
      | node    | @rerun.feature        |
      | browser | @rerun.feature        |
      | node    | {a,b}.feature         |
      | browser | {a,b}.feature         |
