Feature: Watch mode: files
  Vitest reruns the feature files when they change, and when the support code does: its files,
  the modules they import, and the files cucumber finds with its `import` paths. Which runs, and
  how: `watchRuns.feature`.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {
        throw new Error("Not yet");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: changing
          Given a changing step
      """

  # One watcher, edited in turn: each change reruns what it changed, from the project as the
  # previous one left it.
  Scenario Outline: Editing files reruns them (<mode>)
    Given a file named "lib/greeting.ts" with:
      """
      export const greeting = "bye";
      """
    When I start vitest in watch mode in <mode> mode
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |

    # A step file changed: its new code.
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {});
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | passed |
    And it runs the scenarios:
      | NAME     | STATUS |
      | changing | passed |

    # A module the support code imports changed (not a support file itself): its new code.
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";
      import { greeting } from "../lib/greeting.ts";

      Given("a changing step", () => {
        if (greeting !== "hello") {
          throw new Error(`Greeting: ${greeting}`);
        }
      });
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |
    When I change the file "lib/greeting.ts" to:
      """
      export const greeting = "hello";
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | passed |

    # A feature file changed: its scenarios.
    When I change the file "features/a.feature" to:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: renamed
          Given a changing step

        Scenario: added
          Given a changing step
      """
    Then Vitest reports the tests:
      | NAME        | STATE  |
      | A > renamed | passed |
      | A > added   | passed |

    # A step file added defines its steps, removed undefines them.
    When I change the file "features/a.feature" to:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: added
          Given an added step
      """
    Then it runs the scenarios:
      | NAME  | STATUS    |
      | added | undefined |
    When I add the file "features/added.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("an added step", () => {});
      """
    Then it runs the scenarios:
      | NAME  | STATUS |
      | added | passed |
    When I remove the file "features/added.ts"
    Then it runs the scenarios:
      | NAME  | STATUS    |
      | added | undefined |

    # A feature file cucumber can't parse fails its run; the next one runs again, with a tag added
    # (a Vitest tag of its rerun).
    When I change the file "features/a.feature" to:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: broken
          Given a changing step
        this line is not gherkin
      """
    Then the feature file "features/a.feature" fails
    And the output contains:
      """
      [@lotun/vitest-cucumber] feature file can't be parsed
      """
    When I change the file "features/a.feature" to:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        @new
        Scenario: tagged
          Given a changing step
      """
    Then Vitest reports the tests:
      | NAME       | STATE  |
      | A > tagged | passed |
    And it runs the scenarios:
      | NAME   | STATUS |
      | tagged | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A project's server doesn't watch (Vitest's own watcher is its root server's): the plugin in a
  # project hears files added and removed through Vitest's watcher all the same.
  Scenario Outline: A step file added or removed reruns a project's feature files (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        test: {
          projects: [
            {
              plugins: [cucumber({ import: ["features/**/*.ts"] })],
              test: {
                name: "project",
                include: ["features/**/*.feature"],
                browser: {
                  enabled: <browser>,
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
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: added
          Given an added step
      """
    When I start vitest in watch mode
    Then it runs the scenarios:
      | NAME  | STATUS    |
      | added | undefined |
    When I add the file "features/added.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("an added step", () => {});
      """
    Then it runs the scenarios:
      | NAME  | STATUS |
      | added | passed |
    When I remove the file "features/added.ts"
    Then it runs the scenarios:
      | NAME  | STATUS    |
      | added | undefined |

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  # A feature's stories module is made from its stories file too: Vitest reruns a changed test file
  # alone (a stories file is one), so the plugin has Vitest take its features as changed, rerun with it. In `src/`: a
  # stories file of the scenario's own (`.ts`) out of the support code's `features/**/*.ts`.
  Scenario: A stories file changed reruns its feature files (storybook)
    Given a file named "features/stories.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the stories of {storybook:storiesFile}", (_file: string) => {});
      Given("the {storybook:story} story", (_story: string) => {});
      """
    And a file named "src/a.stories.ts" with:
      """
      export default { title: "A", render: () => null };
      export const First = {};
      """
    And a file named "src/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.ts"
        Scenario: on a story
          Given the "First" story
      """
    When I start vitest in watch mode in storybook mode
    Then the feature file "src/a.feature" passes
    # The story it names renamed: its links fail.
    When I change the file "src/a.stories.ts" to:
      """
      export default { title: "A", render: () => null };
      export const Renamed = {};
      """
    Then the feature file "src/a.feature" fails
    And the output contains:
      """
      src/a.stories.ts has no story "First" (it has Renamed)
      """
    When I change the file "src/a.stories.ts" to:
      """
      export default { title: "A", render: () => null };
      export const First = {};
      """
    Then the feature file "src/a.feature" passes
