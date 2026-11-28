Feature: Vitest workers
  Each Vitest worker is a cucumber worker: it runs its BeforeAll hooks when it joins the run, and
  its AfterAll hooks when Vitest stops it. With `isolate: true` (Vitest's default), every feature
  file runs in a fresh worker; with `isolate: false`, a worker runs every feature file it gets.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { AfterAll, BeforeAll, Given } from "@cucumber/cucumber";

      BeforeAll(() => console.log("BeforeAll hook ran"));
      AfterAll(() => console.log("AfterAll hook ran"));
      Given("a passing step", () => {
        // As cucumber's parallel mode gives them: `import.meta.env` in a page, `process.env` in Node.
        const env = import.meta.env.CUCUMBER_WORKER_ID ? import.meta.env : process.env;
        if (env.CUCUMBER_PARALLEL !== "true") {
          throw new Error(`CUCUMBER_PARALLEL: ${env.CUCUMBER_PARALLEL}`);
        }
        console.log(`worker id: ${env.CUCUMBER_WORKER_ID}`);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Background:
          Given the stories of "./a.stories.tsx"
          And the "default" story
        Scenario: a
          Given a passing step
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Background:
          Given the stories of "./b.stories.tsx"
          And the "default" story
        Scenario: b
          Given a passing step
      """

  Scenario Outline: BeforeAll and AfterAll hooks run once per Vitest worker (<mode>, isolate: <isolate>)
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 1, "isolate": <isolate> }
      """
    Then it passes
    And it runs the scenarios:
      | NAME | STATUS |
      | a    | passed |
      | b    | passed |
    And the BeforeAll hooks run <runs> times
    And the AfterAll hooks run <runs> times

    Examples:
      | mode      | isolate | runs |
      | node      | true    | 2    |
      | node      | false   | 1    |
      | browser   | true    | 2    |
      | browser   | false   | 1    |
      | storybook | true    | 2    |
      | storybook | false   | 1    |

  # Its worker id is Vitest's pool id: its slot among the workers or pages running at once, so one
  # worker at a time (`maxWorkers: 1`) is always 1, a new worker per file (`isolate`) too.
  Scenario Outline: A worker's support code has CUCUMBER_PARALLEL, and its CUCUMBER_WORKER_ID is Vitest's pool id (<mode>, isolate: <isolate>)
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 1, "isolate": <isolate> }
      """
    Then it passes
    And the scenarios log the worker id "1"

    Examples:
      | mode      | isolate |
      | node      | true    |
      | node      | false   |
      | browser   | true    |
      | browser   | false   |
      | storybook | true    |
      | storybook | false   |

  # A worker id per slot of Vitest's workers or pages running at once (state a BeforeAll prepares,
  # keyed by it, is that worker's while it runs): 1 to `maxWorkers`, in every mode; a new worker per
  # file (`isolate`) takes its slot's.
  Scenario Outline: Every BeforeAll's worker id is its slot, 1 to maxWorkers (<mode>, isolate: <isolate>)
    Given a file named "features/c.feature" with:
      """
      Feature: C
        Scenario: c
          Given a passing step
      """
    And the run's messages are collected
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 2, "isolate": <isolate> }
      """
    Then it passes
    And in the stream, every BeforeAll's worker id is 1 to 2
    And in the stream, BeforeAll runs <runs>

    Examples:
      | mode    | isolate | runs            |
      | node    | true    | 3 times         |
      | node    | false   | at most 2 times |
      | browser | true    | 3 times         |
      | browser | false   | at most 2 times |

  # As cucumber's parallel workers have them: CUCUMBER_TOTAL_WORKERS is Vitest's `maxWorkers`, and
  # each is set before the support code loads (a value read as it's imported is the same).
  Scenario Outline: A worker's CUCUMBER_TOTAL_WORKERS is Vitest's maxWorkers, set before its support code loads (<mode>)
    Given a file named "features/workers.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      const env = () => (import.meta.env.CUCUMBER_WORKER_ID ? import.meta.env : process.env);
      const atImport = { ...env() };
      Given("the worker's variables were set at import", () => {
        expect(atImport.CUCUMBER_WORKER_ID).toMatch(/^\d+$/);
        expect(atImport.CUCUMBER_WORKER_ID).toBe(env().CUCUMBER_WORKER_ID);
        expect(atImport.CUCUMBER_PARALLEL).toBe("true");
        expect(atImport.CUCUMBER_TOTAL_WORKERS).toBe("3");
      });
      """
    And a file named "features/c.feature" with:
      """
      Feature: C
        Background:
          Given the stories of "./c.stories.tsx"
          And the "default" story
        Scenario: c
          Given the worker's variables were set at import
      """
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 3 }
      """
    Then it passes
    And it runs the scenarios, in any order:
      | NAME | STATUS |
      | a    | passed |
      | b    | passed |
      | c    | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
