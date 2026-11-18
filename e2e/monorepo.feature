Feature: Monorepos
  Every package is a Vitest project of its own, with its own config: cucumber runs in the package
  (its project's root), wherever Vitest runs from.

  Background:
    Given the Vitest config:
      """
      export default { test: { projects: ["packages/*"] } };
      """
    And the Vitest config "packages/a/vitest.config.ts":
      """
      import { cucumber } from "@lotun/vitest-cucumber";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: { name: "a", include: ["features/**/*.feature"] },
      };
      """
    And a file named "packages/a/features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step of package a", () => {});
      """
    And a file named "packages/a/features/a.feature" with:
      """
      Feature: A
        Scenario: in package a
          Given a step of package a
      """
    And the Vitest config "packages/b/vitest.config.ts":
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
          name: "b",
          include: ["features/**/*.feature"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
        },
      };
      """
    And a file named "packages/b/features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step of package b", () => {});
      """
    And a file named "packages/b/features/b.feature" with:
      """
      Feature: B
        Scenario: in package b
          Given a step of package b
      """

  Scenario Outline: Every package runs with its own support code, from the monorepo's root (<manager>)
    Given a file named "<workspace file>" with:
      """
      <workspace>
      """
    When I run vitest
    Then it passes
    And the feature file "packages/a/features/a.feature" passes
    And the feature file "packages/b/features/b.feature" passes
    And it runs the scenarios, in any order:
      | NAME         | STATUS |
      | in package a | passed |
      | in package b | passed |

    # The plugin is ESM only (see the README's Installation): a package's Vitest config must load as
    # an ES module.
    Examples:
      | manager | workspace file      | workspace                                                           |
      | pnpm    | pnpm-workspace.yaml | packages: ["packages/*"]                                            |
      | npm     | package.json        | { "type": "module", "workspaces": ["packages/*"] }                  |
      | yarn    | package.json        | { "type": "module", "private": true, "workspaces": ["packages/*"] } |

  Scenario Outline: A package runs with its own support code, given as Vitest's root (<package>)
    When I run vitest with options:
      """
      { "root": "packages/<package>" }
      """
    Then it passes
    And it runs the scenarios:
      | NAME                 | STATUS |
      | in package <package> | passed |

    Examples:
      | package |
      | a       |
      | b       |
