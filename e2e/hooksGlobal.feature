Feature: Failing BeforeAll and AfterAll hooks
  A Vitest worker runs its BeforeAll hooks before its first scenario, and its AfterAll hooks once
  Vitest is done with it.

  Background:
    Given a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: first
          Given a passing step

        Scenario: second
          Given a passing step
      """

  # As in cucumber: its worker runs no scenario. Vitest reports the hook's failure, with the run's
  # errors.
  Scenario Outline: A failing BeforeAll hook fails the run, its worker's scenarios skipped (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      BeforeAll(() => {
        throw new Error("BeforeAll failed intentionally");
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE   |
      | A > first  | skipped |
      | A > second | skipped |
    And the output contains:
      """
      Error: BeforeAll failed intentionally
      """
    And the output contains:
      """
      features/steps.ts:5:9
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest reports the hook's failure, with the run's errors.
  Scenario Outline: A failing AfterAll hook fails the run, once its scenarios passed (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { AfterAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      AfterAll(() => {
        throw new Error("AfterAll failed intentionally");
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE  |
      | A > first  | passed |
      | A > second | passed |
    And the output contains:
      """
      Error: AfterAll failed intentionally
      """
    And the output contains:
      """
      features/steps.ts:5:9
      """

    Examples:
      | mode      |
      | browser   |
      | node      |
      | storybook |

  # Its cause too, as Vitest's report prints a cause: `Caused by: …`.
  Scenario Outline: A failing BeforeAll hook's error has its cause (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      BeforeAll(() => {
        throw new Error("BeforeAll failed intentionally", { cause: new TypeError("The database is down") });
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE   |
      | A > first  | skipped |
      | A > second | skipped |
    And the output contains:
      """
      Error: BeforeAll failed intentionally
       ❯ Object.<anonymous> features/steps.ts:5:9
      """
    And the output contains:
      """
      Caused by: TypeError: The database is down
       ❯ Object.<anonymous> features/steps.ts:5:62
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Every AfterAll hook runs (cucumber runs them the other way round from how they're defined). With
  # `isolate` (Vitest's default) a worker runs one file, so AfterAll runs in its `afterAll`: each
  # hook's error is the file's, as BeforeAll's. Without, AfterAll runs as the worker ends, where Vitest
  # reports one error (its name, message and stack, in a page): the first one's.
  Scenario Outline: Several failing AfterAll hooks: each one's error, or the first without `isolate` (<mode>, isolate: <isolate>)
    Given a file named "features/steps.ts" with:
      """
      import { AfterAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      AfterAll(() => {
        throw new Error("First AfterAll failed");
      });
      AfterAll(() => {
        throw new RangeError("Second AfterAll failed");
      });
      """
    When I run vitest in <mode> mode with options:
      """
      { "isolate": <isolate> }
      """
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE  |
      | A > first  | passed |
      | A > second | passed |
    And the output contains:
      """
      RangeError: Second AfterAll failed
       ❯ Object.<anonymous> features/steps.ts:8:9
      """
    And the output <first>:
      """
      Error: First AfterAll failed
      """
    And the output doesn't contain:
      """
      AggregateError
      """

    Examples:
      | mode      | isolate | first           |
      | node      | true    | contains        |
      | browser   | true    | contains        |
      | storybook | true    | contains        |
      | node      | false   | doesn't contain |
      | browser   | false   | doesn't contain |
      | storybook | false   | doesn't contain |

  # An AfterAll hook's own AggregateError: with `isolate`, as BeforeAll's (its own message, then each
  # of its errors); without, the first error reported, its own message (its errors not shown), at its
  # line.
  Scenario Outline: A failing AfterAll hook's AggregateError (<mode>, isolate: <isolate>, <errors>)
    Given a file named "features/steps.ts" with:
      """
      import { AfterAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      AfterAll(() => {
        throw new AggregateError(<thrown>, "Both failed");
      });
      """
    When I run vitest in <mode> mode with options:
      """
      { "isolate": <isolate> }
      """
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE  |
      | A > first  | passed |
      | A > second | passed |
    And the output contains:
      """
      <reported>
       ❯ Object.<anonymous> features/steps.ts:<line>
      """
    And the output <head>:
      """
      AggregateError: Both failed
      """

    Examples:
      | mode      | isolate | errors | thrown                                                    | reported                    | line | head     |
      | node      | true    | two    | [new Error("First inner"), new TypeError("Second inner")] | TypeError: Second inner     | 5:55 | contains |
      | browser   | true    | two    | [new Error("First inner"), new TypeError("Second inner")] | TypeError: Second inner     | 5:55 | contains |
      | storybook | true    | none   | []                                                        | AggregateError: Both failed | 5:9  | contains |
      | node      | false   | two    | [new Error("First inner"), new TypeError("Second inner")] | AggregateError: Both failed | 5:9  | contains |
      | browser   | false   | two    | [new Error("First inner"), new TypeError("Second inner")] | AggregateError: Both failed | 5:9  | contains |
      | browser   | false   | none   | []                                                        | AggregateError: Both failed | 5:9  | contains |
      | storybook | false   | two    | [new Error("First inner"), new TypeError("Second inner")] | AggregateError: Both failed | 5:9  | contains |

  # A hook's AggregateError: its own message first (Vitest's runner would drop it), then each of its
  # errors on its own, at its sources, an expect failure with its diff.
  Scenario Outline: A failing BeforeAll hook's AggregateError reports each of its errors (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("a passing step", () => {});
      BeforeAll(() => {
        const errors: unknown[] = [];
        try {
          expect({ a: 1 }).toEqual({ a: 2 });
        } catch (error) {
          errors.push(error);
        }
        errors.push(new TypeError("Second failure"));
        throw new AggregateError(errors, "Both failed");
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE   |
      | A > first  | skipped |
      | A > second | skipped |
    And the output contains:
      """
      AssertionError: expected { a: 1 } to deeply equal { a: 2 }
      """
    And the output contains:
      """
      -   "a": 2,
      +   "a": 1,
      """
    And the output contains:
      """
      TypeError: Second failure
      """
    And the output contains:
      """
      features/steps.ts:8:22
      """
    And the output contains:
      """
      features/steps.ts:12:15
      """
    And the output contains:
      """
      AggregateError: Both failed
       ❯ Object.<anonymous> features/steps.ts:13:9
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The hook's error, holding a BigInt. Vitest's own browser RPC is JSON, which has no BigInt: a page
  # throws it with its BigInts as text (`1n`), so it reaches Vitest's main process (Vitest's bug, any
  # browser test's: an error holding one loses its file's results).
  Scenario Outline: A failing BeforeAll hook's error holding a BigInt fails the run (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      BeforeAll(() => {
        throw Object.assign(new Error("Failed with a BigInt"), { amount: 1n });
      });
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE   |
      | A > first  | skipped |
      | A > second | skipped |
    And the output contains:
      """
      Failed with a BigInt
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A hook taking cucumber's callback (`done`) ends when it calls it, as cucumber's own: its
  # scenarios run once BeforeAll's has, the run ends once AfterAll's has (not cucumber's timeout).
  Scenario Outline: Callback-style BeforeAll and AfterAll hooks end with their callback (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { AfterAll, BeforeAll, Given } from "@cucumber/cucumber";

      let ready = false;
      BeforeAll(function (done) {
        setTimeout(() => {
          ready = true;
          done();
        }, 10);
      });
      AfterAll(function (done) {
        setTimeout(done, 10);
      });
      Given("a passing step", () => {
        if (!ready) {
          throw new Error("BeforeAll's callback hadn't been called");
        }
      });
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME   | STATUS |
      | first  | passed |
      | second | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # With `isolate: false` a worker runs every feature file it gets: its BeforeAll hooks run once, and
  # their failure fails each of its feature files, not only the first.
  Scenario Outline: With `isolate: false`, a failing BeforeAll hook fails every feature file of its worker (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { BeforeAll, Given } from "@cucumber/cucumber";

      Given("a passing step", () => {});
      BeforeAll(() => {
        throw new Error("BeforeAll failed intentionally");
      });
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: third
          Given a passing step
      """
    When I run vitest in <mode> mode with options:
      """
      { "maxWorkers": 1, "isolate": false }
      """
    Then it fails
    And Vitest reports the tests:
      | NAME       | STATE   |
      | A > first  | skipped |
      | A > second | skipped |
      | B > third  | skipped |
    And the feature file "features/a.feature" fails
    And the feature file "features/b.feature" fails

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
