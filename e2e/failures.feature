Feature: Failures
  Every failing step or hook fails its scenario, with its error: its test fails with it.

  Background:
    Given a file named "features/steps.ts" with:
      """
      import { After, Before, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a failing step", () => {
        throw new Error("Step failed intentionally");
      });
      Given("a step that exceeds its timeout", { timeout: 100 }, () => new Promise(() => {}));
      // Never calls back: only its uncaught error ends it.
      Given("a callback step that throws later", { timeout: 2000 }, (_done: () => void) => {
        setTimeout(() => {
          throw new Error("Thrown later intentionally");
        }, 10);
      });

      Before({ tags: "@failBefore" }, () => {
        throw new Error("Before failed intentionally");
      });
      After({ tags: "@failAfter" }, () => {
        throw new Error("After failed intentionally");
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: failing step
          Given a failing step

        @failBefore
        Scenario: failing Before hook
          Given a passing step

        @failAfter
        Scenario: failing After hook
          Given a passing step

        Scenario: step timeout
          Given a step that exceeds its timeout

        Scenario: error thrown later
          Given a callback step that throws later

        Scenario: passing afterwards
          Given a passing step
      """

  Scenario Outline: Failing steps and hooks fail their scenarios (<mode>)
    When I run vitest in <mode> mode
    Then it fails
    And the feature file "features/failures.feature" fails
    And it runs the scenarios:
      | NAME                | STATUS |
      | failing step        | failed |
      | failing Before hook | failed |
      | failing After hook  | failed |
      | step timeout        | failed |
      | error thrown later  | failed |
      | passing afterwards  | passed |
    And Vitest reports the tests:
      | NAME                           | STATE  |
      | Failures > failing step        | failed |
      | Failures > failing Before hook | failed |
      | Failures > failing After hook  | failed |
      | Failures > step timeout        | failed |
      | Failures > error thrown later  | failed |
      | Failures > passing afterwards  | passed |
    And the scenario "failing step" fails with:
      """
      Step failed intentionally
      """
    And the scenario "failing Before hook" fails with:
      """
      Before failed intentionally
      """
    And the scenario "failing After hook" fails with:
      """
      After failed intentionally
      """
    And the scenario "step timeout" fails with:
      """
      function timed out, ensure the promise resolves within 100 milliseconds
      """
    And the scenario "error thrown later" fails with:
      """
      Thrown later intentionally
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Failures don't affect the next feature file on the same Vitest worker (<mode>)
    Given a file named "features/next.feature" with:
      """
      Feature: Next
        Background:
          Given the stories of "./next.stories.tsx"
          And the "default" story
        Scenario: passing in the next file
          Given a passing step
      """
    When I run vitest in <mode> mode with options:
      """
      { "isolate": false, "maxWorkers": 1 }
      """
    Then it fails
    And Vitest reports the tests:
      | NAME                            | STATE  |
      | Failures > failing step         | failed |
      | Failures > failing Before hook  | failed |
      | Failures > failing After hook   | failed |
      | Failures > step timeout         | failed |
      | Failures > error thrown later   | failed |
      | Failures > passing afterwards   | passed |
      | Next > passing in the next file | passed |
    And the feature file "features/next.feature" passes

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # As Vitest reports a test's error: at its step's line in the feature file (its code frame), then
  # its own frames, filtered of cucumber's.
  Scenario Outline: A failing step's error is at its line in the feature file, then its own frames (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      const helper = () => {
        throw new Error("Thrown in a helper");
      };
      Given("a step failing in a helper", () => helper());
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Scenario: in a helper
          Given a step failing in a helper
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > in a helper" fails with:
      """
      Thrown in a helper
      """
    And the output contains:
      """
      ❯ features/failures.feature:3:5
      """
    And the output contains:
      """
      ❯ helper features/steps.ts:4:<column>
      """
    And the output doesn't contain:
      """
      node_modules/@cucumber/cucumber/
      """

    # Firefox's and WebKit's frames (WebKit's throw at its `Error`'s call, not its `new`):
    # `stackframes.feature`, against a plain test's in each engine.
    Examples:
      | mode    | column |
      | node    | 9      |
      | browser | 9      |

  # The frame is the failing step's own line: an `And` step's, a step's with a doc string or a data
  # table (its keyword's line, its argument under it in the code frame), an outline's example's at
  # its outline's step (its test at the example's row).
  Scenario Outline: A failing step's code frame is its own line, whatever the step (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { DataTable, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a failing step", () => {
        throw new Error("Failed in an And step");
      });
      Given("a value of {int} that fails", (value: number) => {
        throw new Error(`Failed with ${value}`);
      });
      Given("a failing step with a doc string:", (_text: string) => {
        throw new Error("Failed with a doc string");
      });
      Given("a failing step with a data table:", (_table: DataTable) => {
        throw new Error("Failed with a data table");
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: an And step
          Given a passing step
          And a failing step

        Scenario Outline: an outline with <value>
          Given a value of <value> that fails

          Examples:
            | value |
            | 1     |
            | 2     |

        Scenario: a doc string
          Given a failing step with a doc string:
            \"\"\"
            some text
            \"\"\"

        Scenario: a data table
          Given a failing step with a data table:
            | a | b |
            | 1 | 2 |
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      Error: Failed in an And step
       ❯ features/failures.feature:7:5
            5|   Scenario: an And step
            6|     Given a passing step
            7|     And a failing step
             |     ^
      """
    And the output contains:
      """
      Error: Failed with 1
       ❯ features/failures.feature:10:5
      """
    And the output contains:
      """
      Error: Failed with 2
       ❯ features/failures.feature:10:5
      """
    And the output contains:
      """
      Error: Failed with a doc string
       ❯ features/failures.feature:18:5
           16|
           17|   Scenario: a doc string
           18|     Given a failing step with a doc string:
             |     ^
           19|       \"\"\"
           20|       some text
      """
    And the output contains:
      """
      Error: Failed with a data table
       ❯ features/failures.feature:24:5
           22|
           23|   Scenario: a data table
           24|     Given a failing step with a data table:
             |     ^
           25|       | a | b |
           26|       | 1 | 2 |
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest names a failed test by its file's Gherkin line and its suites: an Outline's examples, of
  # the same name, are told apart by their lines. Not in Storybook, where they'd be one story: an
  # error (`e2e/storybookErrors.feature`).
  Scenario Outline: A failing Outline's examples are told apart by their lines (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a value of {int} that fails", (value: number) => {
        throw new Error(`Failed with ${value}`);
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Scenario Outline: an outline
          Given a value of <value> that fails

          Examples:
            | value |
            | 1     |
            | 2     |
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      features/failures.feature:7 > Failures > an outline > an outline
      Error: Failed with 1
      """
    And the output contains:
      """
      features/failures.feature:8 > Failures > an outline > an outline
      Error: Failed with 2
      """

    Examples:
      | mode    |
      | node    |
      | browser |

  # A timed-out step's promise rejecting later, while its scenario still runs (an After hook): not
  # its error (cucumber's timeout is), not an uncaught one either (cucumber's race handles it).
  Scenario Outline: A timed-out step's later rejection isn't its error (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After, Given } from "@cucumber/cucumber";

      Given("a step that times out and rejects later", { timeout: 100 }, () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Rejected after its timeout")), 150);
        }),
      );
      After(() => new Promise((resolve) => setTimeout(resolve, 200)));
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: late rejection
          Given a step that times out and rejects later
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > late rejection" fails with:
      """
      function timed out, ensure the promise resolves within 100 milliseconds
      """
    And the output doesn't contain:
      """
      Rejected after its timeout
      """
    And the output doesn't contain:
      """
      Unhandled
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A Background's step (the feature's, or a Rule's) is the scenario's: its failure's code frame is
  # its line in the Background.
  Scenario Outline: A failing Background step's code frame is its line in the Background (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      Given("a background step that fails", () => {
        throw new Error("Failed in a Background");
      });
      """
    And a file named "features/feature.feature" with:
      """
      Feature: Feature background
        Background:
          Given the stories of "./feature.stories.tsx"
          And the "default" story
          Given a background step that fails

        Scenario: in the feature
          Given a passing step
      """
    And a file named "features/rule.feature" with:
      """
      Feature: Rule background
        Background:
          Given the stories of "./rule.stories.tsx"
          And the "default" story
        Rule: a rule
          Background:
            Given a background step that fails

          Scenario: in the rule
            Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Feature background > in the feature" fails with:
      """
      Failed in a Background
      """
    And the output contains:
      """
      Error: Failed in a Background
       ❯ features/feature.feature:5:5
            3|     Given the stories of "./feature.stories.tsx"
            4|     And the "default" story
            5|     Given a background step that fails
             |     ^
      """
    And the output contains:
      """
      Error: Failed in a Background
       ❯ features/rule.feature:7:7
            5|   Rule: a rule
            6|     Background:
            7|       Given a background step that fails
             |       ^
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A step's AggregateError: its own message first (Vitest's runner would drop it), then each of its
  # errors on its own, each at its step's line, then its own frames, filtered of cucumber's.
  Scenario Outline: A failing step's AggregateError reports each of its errors at its line (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step failing with several errors", () => {
        throw new AggregateError([new Error("First failure"), new TypeError("Second failure")], "Both failed");
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: several errors
          Given a step failing with several errors
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      Error: First failure
       ❯ features/failures.feature:6:5
      """
    And the output contains:
      """
      TypeError: Second failure
       ❯ features/failures.feature:6:5
      """
    And the output contains:
      """
      features/steps.ts:4:29
      """
    And the output contains:
      """
      features/steps.ts:4:57
      """
    And the output contains:
      """
      AggregateError: Both failed
       ❯ features/failures.feature:6:5
      """
    And the output doesn't contain:
      """
      node_modules/@cucumber/cucumber/
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # With another failure (here an undefined step's), the AggregateError's own message and its errors
  # are among the test's errors, each on its own.
  Scenario Outline: A failing step's AggregateError with another failure still reports each of its errors (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step failing with several errors", () => {
        throw new AggregateError([new Error("First failure"), new TypeError("Second failure")], "Both failed");
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: several errors and an undefined step
          Given a step failing with several errors
          And an undefined step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      Error: First failure
       ❯ features/failures.feature:6:5
      """
    And the output contains:
      """
      TypeError: Second failure
       ❯ features/failures.feature:6:5
      """
    And the output contains:
      """
      Undefined steps:
        And an undefined step
      """
    And the output contains:
      """
      AggregateError: Both failed
       ❯ features/failures.feature:6:5
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A step's error holding a BigInt: a page throws it with its BigInts as text (Vitest's browser RPC
  # is JSON, which has none), so the test fails with it, as in node mode.
  Scenario Outline: A failing step's error holding a BigInt fails its test (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step failing with a BigInt", () => {
        throw Object.assign(new Error("Failed with a BigInt"), { amount: 1n });
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: a BigInt
          Given a step failing with a BigInt
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME                | STATE  |
      | Failures > a BigInt | failed |
    And the output contains:
      """
      Error: Failed with a BigInt
       ❯ features/failures.feature:6:5
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest's report of it as a test's: its message, its diff, at its step's line.
  Scenario Outline: A failing expect in a step has its diff (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("a step whose expect fails", () => {
        expect({ name: "John", age: 30 }).toEqual({ name: "John", age: 31 });
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: failing expect
          Given a step whose expect fails
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > failing expect" fails with:
      """
      expected { name: 'John', age: 30 } to deeply equal { name: 'John', age: 31 }
      """
    And the output contains:
      """
      AssertionError: expected { name: 'John', age: 30 } to deeply equal { name: 'John', age: 31 }
      """
    And the output contains:
      """
      - Expected
      + Received
      """
    And the output contains:
      """
      -   "age": 31,
      +   "age": 30,
      """
    And the output contains:
      """
       ❯ features/failures.feature:6:5
      """
    And the output contains:
      """
      features/steps.ts:5:37
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest diffs an assertion's own values (a Set, not its serialized copy), also through chai's
  # AssertionError's `toJSON` and a cause.
  Scenario Outline: A failing expect on Sets has their diff (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("a step whose expect on Sets fails", () => {
        expect(new Set([1, 2])).toEqual(new Set([1, 3]));
      });

      Given("a step whose error's cause is a failing expect", () => {
        try {
          expect(new Map([["a", 1]])).toEqual(new Map([["a", 2]]));
        } catch (cause) {
          throw new Error("the check failed", { cause });
        }
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: failing expect on Sets
          Given a step whose expect on Sets fails

        Scenario: a cause's diff
          Given a step whose error's cause is a failing expect
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
        Set {
          1,
      -   3,
      +   2,
        }
      """
    And the output contains:
      """
        Map {
      -   "a" => 2,
      +   "a" => 1,
        }
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest's test error is the step's (its text, at its line), the thrown value its cause (as
  # cucumber formats it: `util.format`'s, a page's roughly, an object as JSON). Vitest prints no
  # cause that's `undefined` (its rule, for any test's error), so `throw undefined` shows the step only.
  Scenario Outline: A thrown value that isn't an Error fails its step (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step throwing a string", () => {
        throw "Not an Error";
      });
      Given("a step throwing null", () => {
        throw null;
      });
      Given("a step throwing undefined", () => {
        throw undefined;
      });
      Given("a step throwing an object", () => {
        throw { code: "E_OBJECT" };
      });
      Given("an async step rejecting with an object", async () => {
        throw { code: "E_ASYNC" };
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: a string
          Given a step throwing a string

        Scenario: null
          Given a step throwing null

        Scenario: undefined
          Given a step throwing undefined

        Scenario: an object
          Given a step throwing an object

        Scenario: an async object
          Given an async step rejecting with an object
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > a string" fails with:
      """
      Given a step throwing a string
      """
    And the test "Failures > null" fails with:
      """
      Given a step throwing null
      """
    And the test "Failures > undefined" fails with:
      """
      Given a step throwing undefined
      """
    And the test "Failures > an object" fails with:
      """
      Given a step throwing an object
      """
    And the test "Failures > an async object" fails with:
      """
      Given an async step rejecting with an object
      """
    And the output contains:
      """
      Caused by: Not an Error
      """
    And the output contains:
      """
      Caused by: null
      """
    And the output contains:
      """
       ❯ features/failures.feature:15:5
      """
    And the output contains:
      """
      E_OBJECT
      """
    And the output contains:
      """
      E_ASYNC
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A hook's: its test's error is the hook's (`Before hook failed`, `After hook failed`: no line of
  # its own in the feature file), the value its cause.
  Scenario Outline: A hook throwing a value that isn't an Error fails its scenario (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After, Before, Given } from "@cucumber/cucumber";

      Before({ tags: "@before" }, () => {
        throw "Not an Error before";
      });
      After({ tags: "@after" }, () => {
        throw { code: "E_AFTER" };
      });
      Given("a passing step", () => {});
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        @before
        Scenario: before
          Given a passing step

        @after
        Scenario: after
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > before" fails with:
      """
      Before hook failed
      """
    And the test "Failures > after" fails with:
      """
      After hook failed
      """
    And the output contains:
      """
      Caused by: Not an Error before
      """
    And the output contains:
      """
      E_AFTER
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A hook's kind is its own in a scenario without steps too (node and browser mode: in a Storybook
  # project, a scenario without steps names no story, an error of its feature's).
  Scenario Outline: A hook throwing a value that isn't an Error fails a scenario without steps (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After } from "@cucumber/cucumber";

      After(() => {
        throw { code: "E_AFTER" };
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Scenario: after, without steps
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > after, without steps" fails with:
      """
      After hook failed
      """
    And the output contains:
      """
      E_AFTER
      """

    Examples:
      | mode    |
      | node    |
      | browser |

  # As a thrown one: the step's error, the value its cause (not cucumber's own error, "Promise
  # rejected without a reason": the plugin keeps the value its code rejected with).
  Scenario Outline: An async step rejecting without a reason fails its step (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("an async step rejecting with null", async () => {
        throw null;
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: async null
          Given an async step rejecting with null
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Failures > async null" fails with:
      """
      Given an async step rejecting with null
      """
    And the output contains:
      """
      Caused by: null
      """
    And the output contains:
      """
       ❯ features/failures.feature:6:5
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's: a function that takes a callback and returns a promise fails at once, whatever either
  # does (an `async function (done)`), with its error; the next scenario's unaffected.
  Scenario Outline: A callback step that also returns a promise fails, as in cucumber (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("an async callback step", async function (done: () => void) {
        done();
      });
      Given("a passing step", () => {});
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: both interfaces
          Given an async callback step

        Scenario: passing afterwards
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME                          | STATE  |
      | Failures > both interfaces    | failed |
      | Failures > passing afterwards | passed |
    And the output contains:
      """
      function uses multiple asynchronous interfaces: callback and promise
      to use the callback interface: do not return a promise
      to use the promise interface: remove the last argument to the function
      """
    And the output contains:
      """
       ❯ features/failures.feature:6:5
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's uncaught-exception handler, while the step runs (browser mode: the page's listener for
  # the window's `error`, the same window): the error fails that step, at its line then the timer's
  # frame, and Vitest doesn't report it itself; the next scenario's unaffected.
  Scenario Outline: An error a timer throws during an async step fails that step (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("an async step whose timer throws", async () => {
        await new Promise((resolve) => {
          setTimeout(() => {
            throw new Error("Thrown in a timer");
          }, 10);
          setTimeout(resolve, 500);
        });
      });
      Given("a passing step", () => {});
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: timer
          Given an async step whose timer throws

        Scenario: passing afterwards
          Given a passing step
      """
    When I run vitest in <mode> mode
    Then it fails
    And it runs the scenarios:
      | NAME               | STATUS |
      | timer              | failed |
      | passing afterwards | passed |
    And the test "Failures > timer" fails with:
      """
      Thrown in a timer
      """
    And the output contains:
      """
       ❯ features/failures.feature:6:5
      """
    And the output contains:
      """
      features/steps.ts:6:13
      """
    And the output doesn't contain:
      """
      Unhandled
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest's report of the errors: their classes' names (an error's `name`, not its class's own
  # `toString`), their causes.
  Scenario Outline: Errors keep their names and causes (<mode>)
    Given the worker's kept Vitests are closed
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      class DatabaseError extends Error {
        override name = "DatabaseError";
      }
      class SecretError extends Error {
        #code = "E_SECRET";
        override name = "SecretError";
        override toString() {
          return `SecretError(${this.#code}): ${this.message}`;
        }
      }
      Given("a step failing with a cause", () => {
        throw new Error("Outer failure", { cause: new TypeError("Inner cause") });
      });
      Given("a step failing with its own class", () => {
        throw new DatabaseError("Connection lost");
      });
      Given("a step failing with its own toString", () => {
        throw new SecretError("Secret failure");
      });
      """
    And a file named "features/failures.feature" with:
      """
      Feature: Failures
        Background:
          Given the stories of "./failures.stories.tsx"
          And the "default" story
        Scenario: with a cause
          Given a step failing with a cause

        Scenario: its own class
          Given a step failing with its own class

        Scenario: its own toString
          Given a step failing with its own toString
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      Caused by: TypeError: Inner cause
      """
    And the output contains:
      """
      DatabaseError: Connection lost
      """
    And the output contains:
      """
      SecretError: Secret failure
      """
    And the output doesn't contain:
      """
      SecretError(E_SECRET)
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
      | firefox   |
      | webkit    |
