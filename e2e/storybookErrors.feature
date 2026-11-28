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
        Background:
          Given the stories of "./Page.stories.ts"
          And the "default" story
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
      Error: [@lotun/vitest-cucumber] feature file can't be parsed
      """
    And the output contains:
      """
        - expected: #EOF, #TableRow, #DocStringSeparator, #StepLine, #TagLine, #ExamplesLine, #ScenarioLine, #RuleLine, #Comment, #Empty, got 'this line is not gherkin'
          src/Broken.feature:4:3
      """
    And the output doesn't contain:
      """
      Failed to import test file
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |
    # Storybook's index fails on it, with the parse error: so on any broken feature file (a link
    # the plugin can't make too: the indexer throws its plan's errors, `preset.test.ts`).
    And building its Storybook fails with:
      """
      Unable to index ./src/Broken.feature:
      Error: [@lotun/vitest-cucumber] feature file can't be parsed
      src/Broken.feature:4:3
      """

  # A link the plugin can't make (here a story its stories file doesn't have) fails the feature's own
  # story tests, with every such error and the stories file's stories; the others run.
  Scenario: A story its stories file doesn't have fails its feature's stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      Given("the stories of {storybook:storiesFile}", (_file: string) => {});
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
        Background:
          Given the stories of "./Linked.stories.ts"
        Scenario: A typo
          Given the "Primry" story
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
        - src/Linked.stories.ts has no story "Primry" (it has Primary)
          src/Linked.feature:5
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |

  # A docs page attached to a broken feature (`<Meta of={…}>`): story tests still start (their index
  # has the feature's own story, hidden: without it Storybook's index fails on the page and no story
  # test runs, the feature's error never shown), the feature fails alone with its error, the others
  # run. Story tests only index a docs page (Storybook's core, without its docs addon), never compile
  # it.
  Scenario: A docs page attached to a broken feature: only the feature's stories fail
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      Given("the stories of {storybook:storiesFile}", (_file: string) => {});
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
        Background:
          Given the stories of "./Linked.stories.ts"
        Scenario: A typo
          Given the "Primry" story
      """
    And a file named "src/Linked.mdx" with:
      """
      import { Meta } from "@storybook/addon-docs/blocks";
      import * as Linked from "./Linked.feature";

      <Meta of={Linked} name="Behavior" />
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
        - src/Linked.stories.ts has no story "Primry" (it has Primary)
          src/Linked.feature:5
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |

  # Two feature files on one stories file with the same name would share its title, and their
  # stories' ids: the one linked second fails, naming the other (the user's call, 2026-11-20). Names
  # differing in case or punctuation only too: Storybook's ids ignore them (2026-11-27).
  Scenario: Two feature files on one stories file whose names give one id fail
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      """
    And a file named "src/Page.feature.md" with:
      """
      # Feature: page!

      ## Background:

      * Given the stories of "./Page.stories.ts"
      * And the "default" story

      ## Scenario: Another step

      * Given a step
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      rename one of them (story id "page-feature-page", Storybook's ids ignore case and punctuation)
      """

  # A feature's scenarios with one story id would be one story in Storybook (its index keeps the
  # first, its preview the last): the same name, names differing in case or punctuation only, two
  # unnamed scenarios, an Outline's rows its name doesn't tell apart. Its stories fail, each such
  # scenario and the id named (the user's call, 2026-11-27: a name to change, no number added); the
  # other features' run. Node and browser mode run them, as cucumber does (`e2e/run.feature`).
  Scenario: Scenarios with one story id fail their feature's stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      """
    And a file named "src/Cart.stories.ts" with:
      """
      export default { title: "Cart", render: () => null };
      """
    And a file named "src/Cart.feature" with:
      """
      Feature: Cart
        Background:
          Given the stories of "./Cart.stories.ts"
          And the "default" story
        Scenario: HTTP request
          Given a step

        Scenario: Http request!
          Given a step

        Scenario:
          Given a step

        Scenario:
          Given a step

        Scenario Outline: Pay
          Given a step

          Examples:
            | card |
            | Visa |
            | Amex |
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
      [@lotun/vitest-cucumber] feature file has scenarios with the same story id
        - Scenario: "HTTP request" and Scenario: "Http request!" have the same story id "cart-feature-cart--http-request", rename one of them
          src/Cart.feature:5
          src/Cart.feature:8
        - Scenario: "Scenario" and Scenario: "Scenario" have the same story id "cart-feature-cart--scenario", rename one of them
          src/Cart.feature:11
          src/Cart.feature:14
        - Example: "Pay" and Example: "Pay" have the same story id "cart-feature-cart--pay", rename one of them
          src/Cart.feature:22
          src/Cart.feature:23
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |

  # A feature names its stories file once, in its Background, and each scenario its story (the
  # user's calls, 2026-11-27: no stories file next to it taken, no story meaning the meta): a feature
  # without the one, or a scenario without the other (a scenario with no steps gets no Background
  # steps), fails its stories, every such error named; the others run.
  Scenario: A feature that doesn't name its stories file, or a scenario its story, fails its stories
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      Given("a step", () => {});
      """
    And a file named "src/Unnamed.stories.ts" with:
      """
      export default { title: "Unnamed", render: () => null };
      """
    And a file named "src/Unnamed.feature" with:
      """
      Feature: Unnamed
        Scenario: On the meta
          Given the "default" story
      """
    And a file named "src/Storyless.stories.ts" with:
      """
      export default { title: "Storyless", render: () => null };
      """
    And a file named "src/Storyless.feature" with:
      """
      Feature: Storyless
        Background:
          Given the stories of "./Storyless.stories.ts"
        Scenario: No story
          Given a step
        Scenario: No steps
      """
    When I run vitest
    Then it fails
    And the output contains:
      """
        - the feature names no stories file, add a stories file step to its Background
          src/Unnamed.feature:1
      """
    And the output contains:
      """
        - the scenario "No story" names no story, add a story step (a story of the stories file, or "default" for its meta)
          src/Storyless.feature:4
      """
    And the output contains:
      """
        - the scenario "No steps" has no steps, give it a story step (a Background's steps only reach a scenario with steps)
          src/Storyless.feature:6
      """
    And Vitest reports the tests:
      | NAME          | STATE  |
      | Page > A step | passed |

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
      [@lotun/vitest-cucumber] cucumber() doesn't go in a Storybook project's Vitest config
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
      Error: [@lotun/vitest-cucumber] the support code failed to load
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
      | STORY                     | STATUS | SHOWS                                                    |
      | page-feature-page--a-step | FAIL   | [@lotun/vitest-cucumber] the support code failed to load |

  # As a feature file's: cucumber's checks refuse it as the support code is built, so the stories
  # fail, with the plugin's error (what's wrong, then the definition's location on its own line).
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
      [@lotun/vitest-cucumber] Given's second argument should be its options (an object) or its code (a function)
        features/steps.ts:4
      """
    # In a static build, the definition's location is its call site as the browser has it (no server,
    # no source maps): the bundle's chunk.
    And the worker's kept Vitests are closed
    When I build its Storybook
    Then its stories show:
      | STORY                     | STATUS | SHOWS                                                                              |
      | page-feature-page--a-step | FAIL   | Given's second argument should be its options (an object) or its code (a function) |
      | page-feature-page--a-step | FAIL   | assets/steps-                                                                      |
    # In `storybook dev`, the dev server maps it with the module's source map, as Vitest does in
    # browser mode: the definition's own line.
    When I start its Storybook dev server
    Then its stories show:
      | STORY                     | STATUS | SHOWS                                                                              |
      | page-feature-page--a-step | FAIL   | Given's second argument should be its options (an object) or its code (a function) |
      | page-feature-page--a-step | FAIL   | features/steps.ts:4                                                                |

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

  # A project's own Storybook hooks faking the timers (`.storybook/preview.ts`'s `beforeAll` and
  # `beforeEach`, as a fake-timers library would: a timer never fires) don't stop a step's timeout:
  # the runtime took the real timers as it loaded (in the preview, with the plugin's annotation,
  # before the project's preview; in story tests, saved by the plugin's setup file, first).
  # `e2e/options.feature` has a Vitest setup file's fake timers.
  Scenario: A preview's fake timers don't stop a step's timeout
    Given a file named ".storybook/preview.ts" with:
      """
      /** Fakes `setTimeout` (its timers never fire), as a project's fake timers would; undone after. */
      const fakeTimers = () => {
        const real = globalThis.setTimeout;
        globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout;
        return () => {
          globalThis.setTimeout = real;
        };
      };

      export default { beforeAll: fakeTimers, beforeEach: fakeTimers };
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", { timeout: 200 }, () => new Promise(() => {}));
      """
    When I run vitest
    Then it fails
    And the test "Page > A step" fails with:
      """
      function timed out, ensure the promise resolves within 200 milliseconds
      """
    When I build its Storybook
    Then its stories show:
      | STORY                     | STATUS | SHOWS                                                                   |
      | page-feature-page--a-step | FAIL   | function timed out, ensure the promise resolves within 200 milliseconds |

  # `e2e/options.feature` has its story tests. Without support code, no Storybook step links a feature
  # to its stories: Storybook's index fails on it.
  Scenario: With no `import` globs, a feature file stops Storybook's build
    Given the plugin options:
      """
      { "import": [] }
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      """
    Then building its Storybook fails with:
      """
      Unable to index ./src/Page.feature:
      names no stories file
      """
