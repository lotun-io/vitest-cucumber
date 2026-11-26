Feature: Running feature files
  Every scenario is a Vitest test, in a suite per feature, rule and scenario outline: it passes,
  fails or is skipped as cucumber's scenario is.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a failing step", () => {
        throw new Error("Step failed");
      });
      """

  Scenario Outline: Every scenario is a Vitest test, in its feature's, rule's and outline's suites (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: first
          Given a passing step

        Rule: a rule
          Scenario Outline: double <n>
            Given a passing step

            Examples:
              | n |
              | 1 |
              | 2 |
      """
    When I run vitest in <mode> mode
    Then it passes
    And Vitest reports the tests:
      | NAME                               | STATE  |
      | A > first                          | passed |
      | A > a rule > double <n> > double 1 | passed |
      | A > a rule > double <n> > double 2 | passed |
    And it runs the scenarios:
      | NAME     | STATUS |
      | first    | passed |
      | double 1 | passed |
      | double 2 | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A name left empty: an unnamed feature has no suite (Vitest prints its file), a rule, scenario or
  # outline is named by its keyword as written, an example of an unnamed outline by its language's
  # `Example` keyword (the user's calls, 2026-11-20: `core/feature/featureTree.ts`).
  Scenario Outline: Empty names: no feature suite, the keywords, `Example` (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature:
        Scenario:
          Given a passing step

        Scenario Outline:
          Given a passing step

          Examples:
            | n |
            | 1 |
            | 2 |

        Rule:
          Example:
            Given a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And Vitest reports the tests:
      | NAME                       | STATE  |
      | Scenario                   | passed |
      | Scenario Outline > Example | passed |
      | Scenario Outline > Example | passed |
      | Rule > Example             | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A test runs its scenario by line, not by name: two scenarios with one name are two tests, each
  # with its own steps.
  Scenario Outline: Two scenarios with the same name each run their own steps (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: same name
          Given a passing step

        Scenario: same name
          Given a failing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME          | STATE  |
      | A > same name | passed |
      | A > same name | failed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A failing scenario fails its test only (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a failing step

        Scenario: passing
          Given a passing step
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME        | STATE  |
      | A > failing | failed |
      | A > passing | passed |
      | B > passing | passed |
    And the feature file "features/a.feature" fails
    And the feature file "features/b.feature" passes
    And the output contains:
      """
      Step failed
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: The support code's World and a definition's timeout are its scenarios' (<mode>)
    Given a file named "features/world.ts" with:
      """
      import { Given, Then, World, setWorldConstructor } from "@cucumber/cucumber";

      setWorldConstructor(
        class extends World {
          greeting = "hello from the World";
        },
      );

      Then("the World greets", (world: { greeting: string }) => {
        if (world.greeting !== "hello from the World") {
          throw new Error(`The World greets with ${world.greeting}`);
        }
      });
      Given("a slow step", { timeout: 50 }, () => new Promise((resolve) => setTimeout(resolve, 200)));
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: greeting
          Then the World greets

        Scenario: slow
          Given a slow step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs the scenarios:
      | NAME     | STATUS |
      | greeting | passed |
      | slow     | failed |
    And the scenario "slow" fails with:
      """
      function timed out, ensure the promise resolves within 50 milliseconds
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The scenario's test's own `concurrent: false`, over the config's (`sequence.concurrent`) and a
  # Gherkin tag's (`test.tags`).
  Scenario Outline: A worker runs its scenarios one at a time, even when Vitest's tests are concurrent (<mode>, <by>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      let running = false;
      Given("a step that waits alone", async () => {
        if (running) {
          throw new Error("Another scenario is running");
        }
        running = true;
        await new Promise((resolve) => setTimeout(resolve, 20));
        running = false;
      });
      """
    And a file named "features/a.feature" with:
      """
      @concurrent
      Feature: A
        Scenario: first
          Given a step that waits alone

        Scenario: second
          Given a step that waits alone
      """
    When I run vitest in <mode> mode with options:
      """
      <options>
      """
    Then it passes
    And Vitest reports the tests:
      | NAME       | STATE  |
      | A > first  | passed |
      | A > second | passed |

    Examples:
      | mode      | by     | options                                                     |
      | node      | config | { "sequence": { "concurrent": true } }                      |
      | browser   | config | { "sequence": { "concurrent": true } }                      |
      | node      | tag    | { "tags": [{ "name": "@concurrent", "concurrent": true }] } |
      | browser   | tag    | { "tags": [{ "name": "@concurrent", "concurrent": true }] } |
      | storybook | config | { "sequence": { "concurrent": true } }                      |
      | storybook | tag    | { "tags": [{ "name": "@concurrent", "concurrent": true }] } |

  Scenario Outline: Feature files run in both of Node's pools (pool: <pool>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step

        Scenario: failing
          Given a failing step
      """
    When I run vitest in node mode with options:
      """
      { "pool": "<pool>" }
      """
    Then it fails
    And it runs the scenarios:
      | NAME    | STATUS |
      | passing | passed |
      | failing | failed |
    And the test "A > failing" fails with:
      """
      Step failed
      """

    Examples:
      | pool    |
      | forks   |
      | threads |

  # Cucumber's `failFast` is Vitest's `bail`: the run stops at the failure, the rest of its file too.
  Scenario Outline: Vitest's bail stops the run (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a failing step

        Scenario: after the failure
          Given a passing step
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: not run
          Given a passing step
      """
    When I run vitest in <mode> mode with options:
      """
      { "bail": 1, "maxWorkers": 1, "sequence": { "shuffle": false } }
      """
    Then it fails
    # Vitest's state of a test that didn't run: `pending`; `b.feature` didn't start.
    And Vitest reports the tests:
      | NAME                  | STATE   |
      | A > failing           | failed  |
      | A > after the failure | pending |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A feature file without scenarios fails, as a Vitest test file without tests does (<mode>)
    Given a file named "features/empty.feature" with:
      """
      Feature: Empty
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the feature file "features/empty.feature" fails
    And the feature file "features/a.feature" passes
    And the output contains:
      """
      No test found in suite
      """

    # Not in Storybook: a feature without scenarios adds no story to its stories file, which may have
    # stories of its own (one without any is skipped, as the addon has no test for it).
    Examples:
      | mode    |
      | node    |
      | browser |

  # The worker's cucumber is patched for the plugin only: a step running cucumber's own API gets
  # plain cucumber (its BeforeAll hooks' results, its definitions' locations).
  Scenario: Cucumber's own API, run from a step, is plain cucumber
    Given a file named "features/steps.ts" with:
      """
      import { writeFileSync } from "node:fs";
      import path from "node:path";
      import { Writable } from "node:stream";
      import { Given } from "@cucumber/cucumber";

      Given("cucumber's API runs the inner feature", async () => {
        const api = await import("@cucumber/cucumber/api");
        const cwd = path.join(import.meta.dirname, "..");
        const { runConfiguration } = await api.loadConfiguration(
          {
            file: false,
            provided: {
              paths: ["inner/inner.feature"],
              import: ["inner/inner-steps.mjs"],
              format: [["summary", "inner-summary.txt"]],
            },
          },
          { cwd },
        );
        const quiet = new Writable({ write: (_chunk, _encoding, done) => done() });
        const { success } = await api.runCucumber(runConfiguration, { cwd, stdout: quiet, stderr: quiet });
        writeFileSync(path.join(cwd, "inner-result.txt"), `success: ${JSON.stringify(success)}`);
      });
      """
    And a file named "inner/inner-steps.mjs" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => {
        throw new Error("Inner BeforeAll failed");
      });
      Given("an inner step", () => {});
      """
    And a file named "inner/inner.feature" with:
      """
      Feature: Inner
        Scenario: inner
          Given an inner step
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: running cucumber
          Given cucumber's API runs the inner feature
      """
    When I run vitest in node mode
    Then it passes
    And the file "inner-result.txt" contains:
      """
      success: false
      """
    And the file "inner-summary.txt" contains, with the platform's separators:
      """
        1) BeforeAll # inner/inner-steps.mjs:3
      """

  # In the page, cucumber's runner doesn't exist (it runs in main): importing its API fails the step
  # with the plugin's reason, not at link time with none.
  Scenario: Cucumber's own API, imported from a step in browser mode, fails it with the reason
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step importing cucumber's API", async () => {
        await import("@cucumber/cucumber/api");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: importing the API
          Given a step importing cucumber's API
      """
    When I run vitest in browser mode
    Then it fails
    And the test "A > importing the API" fails with:
      """
      [@lotun/vitest-cucumber] cucumber's API (`@cucumber/cucumber/api`, `@cucumber/cucumber/lib/…`) isn't available in browser mode
      """

  # One `cucumber()` in the root config, every project inheriting it (`extends: true`): a node project
  # and a browser project each run their feature files with the same support code.
  Scenario: One plugin in the root config serves every project that extends it, node and browser
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          projects: [
            {
              extends: true,
              test: { name: "in-node", include: ["features/node/**/*.feature"] },
            },
            {
              extends: true,
              test: {
                name: "in-browser",
                include: ["features/browser/**/*.feature"],
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
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step in {word}", (where: string) => {
        const inPage = typeof document !== "undefined";
        if (inPage !== (where === "browser")) {
          throw new Error(`ran in the ${inPage ? "page" : "worker"}`);
        }
      });
      """
    And a file named "features/node/a.feature" with:
      """
      Feature: Node
        Scenario: in node
          Given a step in node
      """
    And a file named "features/browser/b.feature" with:
      """
      Feature: Browser
        Scenario: in the browser
          Given a step in browser
      """
    When I run vitest
    Then it passes
    And Vitest reports the tests:
      | NAME                     | STATE  |
      | Node > in node           | passed |
      | Browser > in the browser | passed |

  # One `cucumber()` shared by projects of different roots: each project's feature files and support
  # code are its own root's (cucumber's `cwd`, the support globs and the feature files' paths): a
  # step only the other project defines is undefined.
  Scenario Outline: One plugin in the root config serves projects of different roots, each its own (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      // Each project its own (Vitest names its instances in it).
      const browser = () => ({
        enabled: <browser>,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
        screenshotFailures: false,
      });

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          projects: [
            { extends: true, test: { name: "a", root: "packages/a", include: ["features/**/*.feature"], browser: browser() } },
            { extends: true, test: { name: "b", root: "packages/b", include: ["features/**/*.feature"], browser: browser() } },
          ],
        },
      };
      """
    And a file named "packages/a/features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step of a", () => {});
      """
    And a file named "packages/b/features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step of b", () => {});
      """
    And a file named "packages/a/features/a.feature" with:
      """
      Feature: A
        Scenario: in a
          Given a step of a

        Scenario: b's step
          Given a step of b
      """
    And a file named "packages/b/features/b.feature" with:
      """
      Feature: B
        Scenario: in b
          Given a step of b
      """
    When I run vitest
    Then it fails
    And Vitest reports the tests:
      | NAME         | STATE  |
      | A > in a     | passed |
      | A > b's step | failed |
      | B > in b     | passed |

    Examples:
      | mode    | browser |
      | node    | false   |
      | browser | true    |

  # A worker's first feature file warms cucumber up with a dry run of its first scenario: no hook or
  # step runs during it (cucumber's dry run). In a fresh Vitest, so its worker's first file is this.
  Scenario Outline: The warm-up dry run runs no hook or step (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Before, Given, Then } from "@cucumber/cucumber";
      import { expect } from "vitest";

      let befores = 0;
      let steps = 0;
      Before(() => {
        befores++;
      });
      Given("a counted step", () => {
        steps++;
      });
      Then("the Before hook ran {int} times and the counted step {int}", (hooks: number, counted: number) => {
        expect([befores, steps]).toEqual([hooks, counted]);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: first
          Given a counted step

        Scenario: second
          Then the Before hook ran 2 times and the counted step 1
      """
    When I run vitest in a fresh Vitest in <mode> mode
    Then it passes

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Node mode: the plugin's preload goes first in each worker's `execArgv`, the user's own after it.
  Scenario: The user's own execArgv still applies in node mode
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          include: ["features/**/*.feature"],
          execArgv: ["--import", new URL("./setup.mjs", import.meta.url).href],
        },
      };
      """
    And a file named "setup.mjs" with:
      """
      globalThis.fromExecArgv = "set";
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("the user's preload ran", () => {
        expect((globalThis as { fromExecArgv?: string }).fromExecArgv).toBe("set");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: preloaded
          Given the user's preload ran
      """
    When I run vitest
    Then it passes
    And it runs the scenarios:
      | NAME      | STATUS |
      | preloaded | passed |

  # No watcher, no file event: a run through Vitest's API (and the Storybook addon's own Vitest,
  # which removes the plugin's listeners). Each run reads the project again and makes its feature
  # files' modules again: here the support files' list, which the first run's module imports.
  Scenario Outline: A Vitest run again without a watcher has the support files added since (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a later step
          Given a step added later
      """
    When I open vitest without a watcher in <mode> mode
    And I run its tests
    Then the feature file "features/a.feature" fails
    When the file "features/later.ts" is added, unseen, with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step added later", () => {});
      """
    And I run its tests
    Then the feature file "features/a.feature" passes

    Examples:
      | mode    |
      | node    |
      | browser |

  # A Storybook feature's stories module is made from its stories file too.
  Scenario: A Vitest run again without a watcher has a feature's stories as they are now (storybook)
    Given a file named "features/stories.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

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
        Scenario: on a story
          Given the First story
      """
    When I open vitest without a watcher in storybook mode
    And I run its tests
    Then the feature file "src/a.feature" passes
    # The story it names renamed: its links fail.
    When the file "src/a.stories.ts" is changed, unseen, to:
      """
      export default { title: "A", render: () => null };
      export const Renamed = {};
      """
    And I run its tests
    Then the feature file "src/a.feature" fails
