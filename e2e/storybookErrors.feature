Feature: Storybook errors
  A Storybook project's broken cases, each in a project of its own (`tmp/e2e/<scenario>/`, as a
  user's: its config, its stories, features and support code; Storybook and React from
  `storybook/`): a broken case fails only its own stories, in its story tests (Vitest) and in its
  preview (a static build, each story read in Storybook's UI); a broken feature file fails only its
  own story tests, and stops Storybook's build, as a broken stories file does.

  Background:
    Given a Storybook project
    And a file named "src/Page.stories.ts" with:
      """
      export default { title: "Page", render: () => null };
      """
    And a file named "src/Page.feature" with:
      """
      Feature: Page
        Scenario: A step
          Given a step
      """

  # As a feature file's: its story tests fail, with cucumber's parse error (its module throws it); the
  # others run.
  Scenario: A feature file cucumber can't parse fails its own stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      """
    And a file named "src/Broken.stories.ts" with:
      """
      export default { title: "Broken", render: () => null };
      export const Plain = {};
      """
    And a file named "src/Broken.feature" with:
      """
      Feature: Broken
        Scenario: broken
          Given a step
        this line is not gherkin
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      Error: @lotun/vitest-cucumber: Parse error in src/Broken.feature
      """
    And the output contains:
      """
      (4:3): expected: #EOF
      """
    And the output doesn't contain:
      """
      Failed to import test file
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |
    # Storybook's index fails on it, with the parse error.
    And building its Storybook fails with:
      """
      Unable to index ./src/Broken.feature:
      Error: @lotun/vitest-cucumber: Parse error in src/Broken.feature
      (4:3): expected: #EOF
      """

  # A link the plugin can't make (here a story its stories file doesn't have) fails the feature's own
  # story tests, with every such error and the stories file's stories; the others run.
  Scenario: A story its stories file doesn't have fails its feature's stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      Given("the {storybook:story} story", (_story: string) => {});
      """
    And a file named "src/Linked.stories.ts" with:
      """
      export default { title: "Linked", render: () => null };
      export const Primary = {};
      """
    And a file named "src/Linked.feature" with:
      """
      Feature: Linked
        Scenario: A typo
          Given the Primry story
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      src/Linked.feature:3: src/Linked.stories.ts has no story "Primry" (its stories: Primary)
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |
    And building its Storybook fails with:
      """
      - src/Linked.feature:3: src/Linked.stories.ts has no story "Primry"
      """

  # Two feature files on one stories file with the same name would share its title, and their
  # stories' ids: the one linked second fails, naming the other (the user's call, 2026-11-20).
  # Storybook's index links every feature file, so its build always stops.
  Scenario: Two feature files on one stories file with the same name fail
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      """
    And a file named "src/Page.feature.md" with:
      """
      # Feature: Page

      ## Scenario: Another step

      * Given a step
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      src/Page.stories.ts already has a "Feature: Page"
      """
    And building its Storybook fails with:
      """
      already has a
      """

  # A Storybook project gets the plugin from its addon entry in `.storybook/main.ts` (the preset
  # gives its story tests' plugins): a `cucumber()` in its Vitest config too, its own or the root's
  # it inherits (an inline project does unless it sets `extends: false`), would make every feature file twice, so the run fails with what
  # to do.
  Scenario Outline: cucumber() in a Storybook project's Vitest config fails the run (<plugin>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
      import react from "@vitejs/plugin-react";
      import { playwright } from "@vitest/browser-playwright";
      import path from "node:path";

      export default {
        plugins: [react(), <inherited>],
        test: {
          projects: [
            {
              extends: true,
              plugins: [
                storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") }),
                <own>
              ],
              test: {
                name: "stories",
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright(),
                  instances: [{ browser: "chromium" }],
                  screenshotFailures: false,
                },
              },
            },
          ],
        },
      };
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      @lotun/vitest-cucumber: remove cucumber() from this Storybook project
      """

    Examples:
      | plugin                  | inherited                                  | own                                        |
      | its own                 |                                            | cucumber({ import: ["features/**/*.ts"] }) |
      | inherited from the root | cucumber({ import: ["features/**/*.ts"] }) |                                            |

  # As a feature file's: its stories module fails with the support code's error (it loads as the file
  # runs, not as it's collected), its scenarios' story tests skipped.
  Scenario: Support code that throws as it's imported fails the stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      throw new Error("Support code failed to load");
      """
    When I run vitest
    Then it fails
    And Vitest reports the tests:
      | NAME          | STATE   |
      | Page > A step | skipped |
    And the output contains:
      """
      Error: @lotun/vitest-cucumber: the support code failed to load
      """
    And the output contains:
      """
      Caused by: Error: Support code failed to load
      """
    And the output contains:
      """
      features/steps.ts:3:7
      """
    And the worker's kept Vitests are closed
    When I build its Storybook
    Then its stories show:
      | STORY                     | STATUS | SHOWS                                                   |
      | page-feature-page--a-step | FAIL   | @lotun/vitest-cucumber: the support code failed to load |

  # As a feature file's: cucumber refuses it as the support code loads, so the stories fail, with
  # cucumber's message (the definition's location first) and a frame at its own line.
  Scenario: A step definition cucumber refuses fails the stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      Given("a step without code", "not a function" as never);
      """
    When I run vitest
    Then it fails
    And Vitest reports the tests:
      | NAME          | STATE   |
      | Page > A step | skipped |
    And the output contains:
      """
      features/steps.ts:4: Invalid second argument: should be a object or function
      """
    And the output contains:
      """
      features/steps.ts:4:1
      """
    # In a static build, the definition's location is its call site as the browser has it (no server,
    # no source maps): the bundle's chunk, as Storybook's panel shows a story's own frames.
    And the worker's kept Vitests are closed
    When I build its Storybook
    Then its stories show:
      | STORY                     | STATUS | SHOWS                                                          |
      | page-feature-page--a-step | FAIL   | .js:1: Invalid second argument: should be a object or function |
      | page-feature-page--a-step | FAIL   | assets/steps-                                                  |
    # In `storybook dev`, the dev server maps it with the module's source map, as Vitest does in
    # browser mode: the definition's own line.
    When I start its Storybook dev server
    Then its stories show:
      | STORY                     | STATUS | SHOWS                                                                        |
      | page-feature-page--a-step | FAIL   | features/steps.ts:4: Invalid second argument: should be a object or function |

  # `e2e/hooksGlobal.feature` has story tests' failing BeforeAll hooks.
  Scenario: A failing BeforeAll hook fails the preview's stories
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => {
        throw new Error("BeforeAll failed on purpose");
      });
      Given("a step", () => {});
      """
    When I build its Storybook
    Then its stories show:
      | STORY                     | STATUS | SHOWS                       |
      | page-feature-page--a-step | FAIL   | BeforeAll failed on purpose |

  # `e2e/options.feature` has story tests without `import`.
  Scenario: Without `import`, the preview loads no support code
    Given the plugin options:
      """
      { "import": [] }
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      """
    When I build its Storybook
    Then its stories show:
      | STORY                     | STATUS | SHOWS            |
      | page-feature-page--a-step | FAIL   | Undefined steps: |
