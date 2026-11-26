Feature: Plugin options
  The plugin takes the cucumber options that aren't Vitest's: `import` (every scenario here uses
  it), `dryRun`, `backtrace`, `language`, `strict` and `worldParameters`.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a failing step", () => {
        throw new Error("Step failed intentionally");
      });
      """

  Scenario Outline: The feature files' default language is the `language` option's (<mode>)
    Given the plugin options:
      """
      { "language": "fr" }
      """
    And a file named "features/a.feature" with:
      """
      Fonctionnalité: A
        Scénario: en français
          Soit a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME        | STATUS |
      | en français | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's `filterStacktraces` (its `backtrace` option's opposite): a failing step's error's
  # frames, as Vitest prints them, are cut at cucumber's first. In a page, cucumber's runtime is the
  # plugin's (it runs in the page): the frames below the step are the plugin's (`<frame>`).
  Scenario Outline: Stack traces are filtered of cucumber's frames (<mode>)
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a failing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "A > failing" fails with:
      """
      Step failed intentionally
      """
    And the output doesn't contain:
      """
      <frame>
      """

    Examples:
      | mode      | frame                     |
      | node      | worker/runner/userCode.ts |
      | browser   | worker/runner/userCode.ts |
      | storybook | worker/runner/userCode.ts |

  Scenario Outline: The `backtrace` option keeps cucumber's frames in stack traces (<mode>)
    Given the plugin options:
      """
      { "backtrace": true }
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a failing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "A > failing" fails with:
      """
      Step failed intentionally
      """
    And the output contains:
      """
      <frame>
      """

    Examples:
      | mode      | frame                     |
      | node      | worker/runner/userCode.ts |
      | browser   | worker/runner/userCode.ts |
      | storybook | worker/runner/userCode.ts |

  # Only the options the plugin supports reach cucumber: any other given (untyped), e.g. a
  # formatter's, cucumber's `paths` or `retry` (Vitest's), is left out.
  Scenario Outline: Cucumber's options the plugin doesn't support are left out (<mode>)
    Given the plugin options:
      """
      { "format": [["message", "messages.ndjson"]], "paths": ["nowhere/*.feature"], "retry": 1 }
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a failing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs the scenarios:
      | NAME    | STATUS |
      | failing | failed |
    And the scenario "failing" is attempted 1 time
    And the file "messages.ndjson" doesn't exist

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Each project its own options: node and browser projects their `cucumber(…)`'s (each its own, or
  # one in the root config that they inherit), a Storybook project its addon entry's in
  # `.storybook/main.ts` (the harness's: `features/**/*.ts`; `extends: false`, so it inherits nothing
  # from the root, where a `cucumber()` would be refused). Each one's steps are only its projects': a
  # project with the other's would have an undefined step.
  Scenario Outline: Node, browser and Storybook projects each have their own options (<plugins>)
    Given a Storybook project
    And the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
      import react from "@vitejs/plugin-react";
      import { playwright } from "@vitest/browser-playwright";
      import path from "node:path";

      // Each project its own (Vitest names its instances in it).
      const browser = () => ({
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" as const }],
        screenshotFailures: false,
      });

      export default {
        plugins: [<inherited>],
        test: {
          projects: [
            { extends: true, plugins: [<own>], test: { name: "node", include: ["node/**/*.feature"] } },
            {
              extends: true,
              plugins: [<own>],
              test: { name: "browser", include: ["browser/**/*.feature"], browser: browser() },
            },
            {
              // Not the root's `cucumber()`: an inline project inherits it unless it says so.
              extends: false,
              plugins: [
                react(),
                storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") }),
              ],
              test: { name: "storybook", browser: browser() },
            },
          ],
        },
      };
      """
    And a file named "node/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a node and browser step", () => {});
      """
    And a file named "node/a.feature" with:
      """
      Feature: Node
        Scenario: in node
          Given a node and browser step
      """
    And a file named "browser/b.feature" with:
      """
      Feature: Browser
        Scenario: in the browser
          Given a node and browser step
      """
    And a file named "features/stories.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the {storybook:story} story", (_story: string) => {});
      """
    And a file named "src/Page.stories.ts" with:
      """
      export default { title: "Page", render: () => null };
      export const Primary = {};
      """
    And a file named "src/Page.feature" with:
      """
      Feature: Page
        Scenario: on a story
          Given the Primary story
          And a passing step
      """
    When I run vitest
    Then it passes
    And Vitest reports the tests:
      | NAME                     | STATE  |
      | Node > in node           | passed |
      | Browser > in the browser | passed |
      | Page > on a story        | passed |

    Examples:
      | plugins                             | inherited                              | own                                    |
      | a cucumber() in each project        |                                        | cucumber({ import: ["node/**/*.ts"] }) |
      | one in the root, node and browser's | cucumber({ import: ["node/**/*.ts"] }) |                                        |

  # The plugin reads no options file: its options are the ones it's given (written inline, or
  # imported from any file by the user's config). A `cucumber.config.ts` in the project's root or
  # its Storybook config folder is never read (one that can't load either).
  Scenario Outline: A cucumber.config.ts isn't read (<mode>)
    Given a file named "cucumber.config.ts" with:
      """
      export default {
        import: [
      };
      """
    And a file named ".storybook/cucumber.config.ts" with:
      """
      export default {
        import: [
      };
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME    | STATUS |
      | passing | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The plugin's options only: cucumber's configuration file isn't read (one that can't load
  # either).
  Scenario Outline: A cucumber config file is ignored (<mode>)
    Given a file named "cucumber.mjs" with:
      """
      export default {
        paths: [
      };
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME    | STATUS |
      | passing | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # `import` is required: a config without it fails as `cucumber()` is called, with what to give
  # (in every mode: the config fails to load). A wrong one (`null`, not an array of strings), and
  # Storybook's addon entry without it: unit tests (`options.test.ts`, `storybookPlugin.test.ts`).
  Scenario: Without `import`, the run fails with what to give
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { defineConfig } from "vitest/config";

      export default defineConfig({
        // @ts-expect-error -- the option left out, as a JavaScript config may
        plugins: [cucumber({})],
        test: { include: ["features/**/*.feature"] },
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a
          Given a step
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      [@lotun/vitest-cucumber] the "import" option is required, an array of your support code's globs, e.g. ["features/**/*.ts"]
      """

  # Unlike cucumber (each feature file's closest `features` folder, else its own, everything in it),
  # no default: `import` is required (`cucumber()` without it throws), and with no globs no support
  # code loads, in every mode. The steps are undefined, with snippets.
  Scenario Outline: With no `import` globs, no support code is loaded (<mode>)
    Given the plugin options:
      """
      { "import": [] }
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a
          Given a step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs the scenarios:
      | NAME | STATUS    |
      | a    | undefined |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # As cucumber: a BeforeAll hook's `this.parameters` is the run's, each World's a clone of them
  # (a BeforeAll hook's changes included), so a scenario's changes don't reach the next one.
  Scenario Outline: `worldParameters` are the World's parameters, a clone per World, a BeforeAll hook's changes included (<mode>)
    Given the plugin options:
      """
      { "worldParameters": { "baseUrl": "http://a", "nested": { "n": 1 } } }
      """
    And a file named "features/parameters.ts" with:
      """
      import { BeforeAll, Given, Then } from "@cucumber/cucumber";
      import { expect } from "vitest";

      BeforeAll((context) => {
        expect(context.parameters).toEqual({ baseUrl: "http://a", nested: { n: 1 } });
        context.parameters.fromBeforeAll = true;
      });
      Given("I change the parameters", (world) => {
        world.parameters.nested.n = 2;
      });
      Then("the parameters are the configured ones", (world) => {
        expect(world.parameters).toEqual({
          baseUrl: "http://a",
          nested: { n: 1 },
          fromBeforeAll: true,
        });
      });
      """
    And a file named "features/parameters.feature" with:
      """
      Feature: Parameters
        Scenario: changing them
          Given I change the parameters

        Scenario: a fresh clone
          Then the parameters are the configured ones
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME          | STATUS |
      | changing them | passed |
      | a fresh clone | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # With `isolate: false` a worker's BeforeAll hooks run once, for every feature file it runs: their
  # changes to the parameters reach the next file's Worlds too; a step's change stays its World's.
  Scenario Outline: With `isolate: false`, a BeforeAll hook's `worldParameters` reach every feature file of its worker (<mode>)
    Given the plugin options:
      """
      { "worldParameters": { "n": 1 } }
      """
    And a file named "features/parameters.ts" with:
      """
      import { BeforeAll, Given, Then } from "@cucumber/cucumber";
      import { expect } from "vitest";

      BeforeAll((context) => {
        context.parameters.fromBeforeAll = true;
      });
      Given("I change the parameters", (world) => {
        world.parameters.n = 2;
      });
      Then("the parameters are the BeforeAll hook's", (world) => {
        expect(world.parameters).toEqual({ n: 1, fromBeforeAll: true });
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: changing them
          Given I change the parameters
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: the next file
          Then the parameters are the BeforeAll hook's
      """
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 1, "isolate": false }
      """
    Then it passes
    And Vitest reports the tests:
      | NAME              | STATE  |
      | A > changing them | passed |
      | B > the next file | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Each feature module carries the configuration as JSON: a configured value `JSON.stringify`
  # refuses (a `bigint`, a cycle) is refused as `cucumber()` is called, so Vitest can't load the
  # config, its error the cause.
  Scenario Outline: A configured world parameter JSON.stringify refuses fails the run (<browser>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({
            import: ["features/**/*.ts"],
            worldParameters: { url: "http://a", limit: 10n },
          }),
        ],
        test: {
          include: ["features/**/*.feature"],
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
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a
          Given a passing step
      """
    When I run vitest in a fresh Vitest
    Then it fails
    And the output contains:
      """
      [Error: [@lotun/vitest-cucumber] the "worldParameters" option can't be converted to JSON] {
        [cause]: TypeError: Do not know how to serialize a BigInt
      """

    Examples:
      | browser |
      | false   |
      | true    |

  # Values JSON can't carry come from a BeforeAll hook, which runs where the Worlds are: each World
  # gets a clone of them, their types kept (cucumber's `structuredClone`, the page's).
  Scenario Outline: A BeforeAll hook's world parameters keep their types in each World (<mode>)
    Given a file named "features/parameters.ts" with:
      """
      import { BeforeAll, Then } from "@cucumber/cucumber";
      import { expect } from "vitest";

      BeforeAll((context) => {
        context.parameters.cache = new Map([["k", 1]]);
        context.parameters.at = new Date(0);
        context.parameters.limit = 10n;
      });
      Then("the parameters keep their types", (world) => {
        expect(world.parameters.cache).toBeInstanceOf(Map);
        expect(world.parameters.cache.get("k")).toBe(1);
        expect(world.parameters.at).toBeInstanceOf(Date);
        expect(world.parameters.limit).toBe(10n);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: first
          Then the parameters keep their types

        Scenario: second
          Then the parameters keep their types
      """
    When I run vitest in <mode> mode
    Then it passes

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's dry run: no step or hook runs, and the run succeeds, an undefined or ambiguous step's
  # too (cucumber 13.3.0's own result: success, the step `UNDEFINED`, `AMBIGUOUS`). A scenario whose
  # steps are all skipped is a skipped test; one with an undefined or ambiguous step too, its note
  # that step, as the summary names it.
  Scenario Outline: With `dryRun`, no step runs: each scenario is skipped, an undefined or ambiguous step its note (<mode>)
    Given the plugin options:
      """
      { "dryRun": true }
      """
    And a file named "features/ambiguous.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given(/^an ambiguous step$/, () => {});
      Given(/^an (ambiguous) step$/, () => {});
      """
    And a file named "features/dry.feature" with:
      """
      Feature: Dry
        Scenario: failing
          Given a failing step

        Scenario: undefined
          Given a passing step
          When a step nobody defined

        Scenario: ambiguous
          Given an ambiguous step
      """
    When I run vitest in <mode> mode
    Then it passes
    And Vitest reports the tests:
      | NAME            | STATE   | NOTE                                       |
      | Dry > failing   | skipped |                                            |
      | Dry > undefined | skipped | Undefined step: When a step nobody defined |
      | Dry > ambiguous | skipped | Ambiguous step: Given an ambiguous step    |
    And the output doesn't contain:
      """
      Step failed intentionally
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # With `strict: false`, cucumber's run succeeds with a pending step (its scenario `PENDING`, the
  # steps after it not run): a skipped test, its note the pending step. With `strict` (the default)
  # it fails (`statuses.feature`).
  Scenario Outline: With `strict: false`, a pending step's scenario is skipped, the step its note (<mode>)
    Given the plugin options:
      """
      { "strict": false }
      """
    And a file named "features/pending.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a pending step", () => "pending");
      """
    And a file named "features/pending.feature" with:
      """
      Feature: Pending
        Scenario: pending
          Given a passing step
          When a pending step
          Then a failing step

        Scenario: passing
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And Vitest reports the tests:
      | NAME              | STATE   | NOTE                              |
      | Pending > pending | skipped | Pending step: When a pending step |
      | Pending > passing | passed  |                                   |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest's timeouts are cucumber's defaults: its `testTimeout` a scenario's steps' and hooks', its
  # `hookTimeout` BeforeAll's and AfterAll's (a scenario's test and the feature file's hooks have none
  # of Vitest's own: cucumber's runs time out, with cucumber's message).
  Scenario Outline: Vitest's testTimeout is a step's default timeout (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step taking 200 ms", () => new Promise((resolve) => setTimeout(resolve, 200)));
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: slow
          Given a step taking 200 ms
      """
    When I run vitest in <mode> mode with options:
      """
      { "testTimeout": 50, "hookTimeout": 5000 }
      """
    Then it fails
    And the test "A > slow" fails with:
      """
      function timed out, ensure the promise resolves within 50 milliseconds
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Vitest's hookTimeout is a BeforeAll hook's default timeout (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => new Promise((resolve) => setTimeout(resolve, 200)));
      Given("a step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: quick
          Given a step
      """
    When I run vitest in <mode> mode with options:
      """
      { "testTimeout": 5000, "hookTimeout": 50 }
      """
    Then it fails
    And the output contains:
      """
      function timed out, ensure the promise resolves within 50 milliseconds
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A Gherkin tag's Vitest definition with a `timeout` is Vitest's timeout for its scenarios (the
  # plugin leaves out its own `timeout: 0` then): of several, Vitest's choice, the lowest `priority`
  # first, else the test's last tag (a pickle's innermost: an outer tag's yields to an inner one's).
  Scenario Outline: A Gherkin tag's Vitest timeout applies to its scenarios (<mode>)
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [cucumber({ import: ["features/**/*.ts"] })],
        test: {
          include: ["features/**/*.feature"],
          tags: [
            { name: "@slow", timeout: 50 },
            { name: "@patient", timeout: 10000 },
          ],
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
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step taking 300 ms", () => new Promise((resolve) => setTimeout(resolve, 300)));
      """
    And a file named "features/tagged.feature" with:
      """
      @slow
      Feature: Tagged
        Scenario: timed out
          Given a step taking 300 ms

        @patient
        Scenario: given longer
          Given a step taking 300 ms
      """
    And a file named "features/untagged.feature" with:
      """
      Feature: Untagged
        Scenario: untimed
          Given a step taking 300 ms
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME                  | STATE  |
      | Tagged > timed out    | failed |
      | Tagged > given longer | passed |
      | Untagged > untimed    | passed |
    And the test "Tagged > timed out" fails with:
      """
      Test timed out in 50ms.
      """

    Examples:
      | mode      | browser |
      | node      | false   |
      | browser   | true    |
      | storybook | true    |
