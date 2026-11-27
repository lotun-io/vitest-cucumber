Feature: Watch mode: runs
  A change reruns the feature files it changed, in every run Vitest would rerun them: a worker kept
  between files and runs, Vitest's filter, several projects, a first run that couldn't start. What
  a change reruns: `watchFiles.feature`.

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

  Scenario Outline: A Vitest worker kept between files and runs reruns them all with the new code (<mode>, isolate: false)
    Given a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: also changing
          Given a changing step
      """
    When I start vitest in watch mode in <mode> mode with options:
      """
      { "isolate": false, "maxWorkers": 1 }
      """
    Then Vitest reports the tests:
      | NAME              | STATE  |
      | A > changing      | failed |
      | B > also changing | failed |
    When I change the file "features/steps.ts" to:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => console.log("BeforeAll hook ran"));
      Given("a changing step", () => {});
      """
    Then Vitest reports the tests:
      | NAME              | STATE  |
      | A > changing      | passed |
      | B > also changing | passed |
    And the BeforeAll hooks run 1 time

    Examples:
      | mode    |
      | node    |
      | browser |

  Scenario Outline: Changing a step file reruns only the feature files Vitest's filter picks (<mode>)
    Given a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: also changing
          Given a changing step
      """
    When I start vitest in watch mode in <mode> mode with "features/a.feature"
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {});
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | passed |

    Examples:
      | mode    |
      | node    |
      | browser |

  # A feature file's line keeps picking its scenario as a change reruns it (in Storybook, its stories
  # file's story), until Vitest's filename filter changes (its `p` key).
  Scenario Outline: A line filter picks its scenario in every rerun, until the filename filter changes (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: changing
          Given a changing step

        Scenario: also changing
          Given a changing step
      """
    When I start vitest in watch mode in <mode> mode with "features/a.feature:8"
    Then it runs the scenarios:
      | NAME          | STATUS |
      | also changing | failed |
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {});
      """
    Then it runs the scenarios:
      | NAME          | STATUS |
      | also changing | passed |
    When I change Vitest's filename filter to "features/a"
    Then it runs the scenarios, in any order:
      | NAME          | STATUS |
      | changing      | passed |
      | also changing | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A step file shared by several projects reruns them all, together (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      const project = (name: string) => ({
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          name,
          include: ["features/**/*.feature"],
          browser: {
            enabled: <browser>,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
        },
      });

      export default { test: { projects: [project("first"), project("second")] } };
      """
    When I start vitest in watch mode
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |
      | A > changing | failed |
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {});
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | passed |
      | A > changing | passed |

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  Scenario Outline: A first run that can't start fails its feature files, and fixing the support code reruns them (<mode>)
    Given a file named "features/steps.ts" with:
      """
      throw new Error("Broken support code");
      """
    When I start vitest in watch mode in <mode> mode
    Then the feature file "features/a.feature" fails
    And the output contains:
      """
      Broken support code
      """
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {});
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | passed |

    Examples:
      | mode    |
      | node    |
      | browser |

  # Vitest's watcher lets the run finish, then reruns with the edit: each run its workers' own
  # cucumber run (BeforeAll and AfterAll once each), the last one the edit's.
  Scenario Outline: An edit during a run reruns its feature files after it, with the edit (<mode>)
    Given a file named "features/slow.ts" with:
      """
      import { AfterAll, BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => console.log("BeforeAll hook ran"));
      AfterAll(() => console.log("AfterAll hook ran"));
      Given("a slow step", () => new Promise((resolve) => setTimeout(resolve, 1000)));
      """
    When I start vitest in watch mode in <mode> mode
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |
    When I start changing the file "features/a.feature" to:
      """
      Feature: A
        Scenario: first edit
          Given a slow step
      """
    And I change the file "features/a.feature" to:
      """
      Feature: A
        Scenario: second edit
          Given a slow step
      """
    Then Vitest reports the tests:
      | NAME            | STATE  |
      | A > second edit | passed |
    And the BeforeAll hooks run 1 time
    And the AfterAll hooks run 1 time

    Examples:
      | mode    |
      | node    |
      | browser |

  # Vitest restarts as its config file changes: everything closed, its config resolved again (the
  # plugin made again, with its new options), every file run. The plugin then follows the new
  # Vitest: a support file changed after it still reruns the feature files.
  Scenario Outline: The config file changed restarts Vitest with the plugin's new options, and later changes still rerun (<mode>)
    Given the plugin options:
      """
      { "worldParameters": { "greeting": "bye" } }
      """
    And a file named "features/steps.ts" with:
      """
      import { Given, type IWorld } from "@cucumber/cucumber";

      Given("a changing step", (world: IWorld<{ greeting: string }>) => {
        if (world.parameters.greeting !== "hello") {
          throw new Error(`Greeting: ${world.parameters.greeting}`);
        }
      });
      """
    When I start vitest in watch mode in <mode> mode
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |
    And the output contains:
      """
      Greeting: bye
      """
    When I change the plugin options to:
      """
      { "worldParameters": { "greeting": "hello" } }
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | passed |
    When I change the file "features/steps.ts" to:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a changing step", () => {
        throw new Error("After the restart");
      });
      """
    Then Vitest reports the tests:
      | NAME         | STATE  |
      | A > changing | failed |
    And the output contains:
      """
      After the restart
      """

    Examples:
      | mode    |
      | node    |
      | browser |
