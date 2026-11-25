Feature: The support code's API
  What the support code gets from cucumber, as it gets it in cucumber, in both modes: parameter
  types, a World, a step's arguments, expressions, async and callback steps. In browser mode most of
  it crosses between the page and main. Each scenario's steps check what they get (`expect`): a
  wrong value fails its scenario, with the step's diff.

  Scenario Outline: A parameter type's transformer: its value, its `this` the World, awaited if async (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { defineParameterType, Given, setWorldConstructor, World } from "@cucumber/cucumber";
      import { expect } from "vitest";

      class Color {
        constructor(readonly name: string) {}
      }
      class TestWorld extends World {
        readonly palette = "warm";
      }
      setWorldConstructor(TestWorld);

      defineParameterType({
        name: "color",
        regexp: /red|blue/,
        transformer(this: TestWorld, name: string) {
          return new Color(`${this.palette} ${name}`);
        },
      });
      defineParameterType({
        name: "size",
        regexp: /\d+cm/,
        transformer: async (text: string) => Number.parseInt(text, 10),
      });

      Given("a {color} box of {size}", function (this: TestWorld, color: Color, size: number) {
        expect(color).toBeInstanceOf(Color);
        expect(color.name).toBe("warm red");
        expect(size).toBe(20);
        expect(this).toBeInstanceOf(TestWorld);
      });
      """
    And a file named "features/types.feature" with:
      """
      Feature: Types
        Scenario: custom types
          Given a red box of 20cm
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME         | STATUS |
      | custom types | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A custom World: one per scenario, its state kept across its steps and hooks (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Before, Given, Then, setWorldConstructor, World } from "@cucumber/cucumber";
      import { expect } from "vitest";

      class Counter extends World {
        count = 0;
        add(amount: number) {
          this.count += amount;
        }
      }
      setWorldConstructor(Counter);

      Before(function (this: Counter) {
        expect(this.count).toBe(0);
        this.add(1);
      });
      Given("I add {int}", function (this: Counter, amount: number) {
        this.add(amount);
      });
      Then("the count is {int}", function (this: Counter, expected: number) {
        expect(this).toBeInstanceOf(Counter);
        expect(this.count).toBe(expected);
      });
      """
    And a file named "features/world.feature" with:
      """
      Feature: World
        Scenario: first
          Given I add 2
          Then the count is 3

        Scenario: second
          Given I add 5
          Then the count is 6
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

  Scenario Outline: A step's data table and doc string (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { DataTable, Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("the users:", (table: DataTable) => {
        expect(table).toBeInstanceOf(DataTable);
        expect(table.raw()).toEqual([
          ["name", "role"],
          ["ann", "admin"],
          ["bob", "user"],
        ]);
        expect(table.hashes()).toEqual([
          { name: "ann", role: "admin" },
          { name: "bob", role: "user" },
        ]);
        expect(table.rows()).toEqual([
          ["ann", "admin"],
          ["bob", "user"],
        ]);
        expect(table.transpose().raw()).toEqual([
          ["name", "ann", "bob"],
          ["role", "admin", "user"],
        ]);
      });
      Given("the settings:", (table: DataTable) => {
        expect(table.rowsHash()).toEqual({ theme: "dark", lang: "en" });
      });
      Given("the text {string}:", (title: string, text: string) => {
        expect(title).toBe("notes");
        expect(text).toBe("first line\n  second line");
      });
      """
    And a file named "features/arguments.feature" with:
      """
      Feature: Arguments
        Scenario: arguments
          Given the users:
            | name | role  |
            | ann  | admin |
            | bob  | user  |
          And the settings:
            | theme | dark |
            | lang  | en   |
          And the text "notes":
            ```markdown
            first line
              second line
            ```
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME      | STATUS |
      | arguments | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Cucumber expressions' built-in types and regular expressions (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given(
        "{int}, {float}, {word}, {string}, {} and {biginteger}",
        (int: number, float: number, word: string, text: string, any: string, big: bigint) => {
          expect(int).toBe(-3);
          expect(float).toBe(2.5);
          expect(word).toBe("plain");
          expect(text).toBe("quoted text");
          expect(any).toBe("anything here");
          expect(big).toBe(12345678901234567890n);
        },
      );
      Given("I have {int} cucumber(s) in my belly/stomach", (count: number) => {
        expect([1, 2]).toContain(count);
      });
      // A group matching an integer is one (cucumber expressions' rule for regular expressions).
      Given(/^a regexp with (\d+) and (\w+)$/, (digits: number, word: string) => {
        expect(digits).toBe(42);
        expect(word).toBe("answer");
      });
      """
    And a file named "features/expressions.feature" with:
      """
      Feature: Expressions
        Scenario: expressions
          Given -3, 2.5, plain, "quoted text", anything here and 12345678901234567890
          And I have 1 cucumber in my belly
          And I have 2 cucumbers in my stomach
          And a regexp with 42 and answer
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME        | STATUS |
      | expressions | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Async and callback steps and hooks, `this` their World (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After, Given, Then, World } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("an async step", async function (this: World & { order?: string[] }) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        this.order = ["async"];
      });
      Given("a callback step", function (this: World & { order: string[] }, done: () => void) {
        setTimeout(() => {
          this.order.push("callback");
          done();
        }, 10);
      });
      Then("they ran in order", function (this: World & { order: string[] }) {
        expect(this).toBeInstanceOf(World);
        expect(this.order).toEqual(["async", "callback"]);
      });
      After(function (this: World & { order: string[] }, _hook: unknown, done: () => void) {
        expect(this.order).toEqual(["async", "callback"]);
        setTimeout(done, 10);
      });
      """
    And a file named "features/async.feature" with:
      """
      Feature: Async
        Scenario: async and callback
          Given an async step
          And a callback step
          Then they ran in order
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME               | STATUS |
      | async and callback | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: Cucumber's `version` and `wrapPromiseWithTimeout`, cucumber's own (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, version, wrapPromiseWithTimeout } from "@cucumber/cucumber";
      import { expect } from "vitest";

      Given("cucumber's version is logged", () => {
        console.log(`cucumber version: ${version}`);
      });
      Given("a slow action times out", async () => {
        const slow = new Promise((resolve) => setTimeout(resolve, 1000));
        await expect(wrapPromiseWithTimeout(slow, 20)).rejects.toThrow(
          "Action did not complete within 20 milliseconds",
        );
        await expect(wrapPromiseWithTimeout(Promise.resolve("done"), 1000)).resolves.toBe("done");
      });
      """
    And a file named "features/cucumber.feature" with:
      """
      Feature: Cucumber
        Scenario: its exports
          Given cucumber's version is logged
          And a slow action times out
      """
    When I run vitest in <mode> mode
    Then it passes
    And the output contains the installed cucumber's version, after "cucumber version: "

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's `setDefinitionFunctionWrapper`: each step's and hook's code wrapped, the wrapper given
  # the definition's `wrapperOptions`; the wrapped code runs on the World, its value the step's.
  Scenario Outline: The definition function wrapper wraps each definition, with its options (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, setDefinitionFunctionWrapper } from "@cucumber/cucumber";
      import { expect } from "vitest";

      const wrapped: string[] = [];
      setDefinitionFunctionWrapper((fn, options) =>
        function (this: unknown, ...args: unknown[]) {
          wrapped.push(String((options as { label?: string } | undefined)?.label));
          return fn.apply(this, args);
        },
      );
      Given("a labelled step", { wrapperOptions: { label: "labelled" } }, function () {
        this.seen = "the World";
      });
      Given("a plain step", function () {
        expect(this.seen).toBe("the World");
      });
      Given("the wrapper saw {string}", (labels: string) => {
        expect(wrapped.slice(-3).join(", ")).toBe(labels);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: Wrapper
        Scenario: wrapped
          Given a labelled step
          And a plain step
          Then the wrapper saw "labelled, undefined, undefined"
      """
    When I run vitest in <mode> mode
    Then it passes

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # As cucumber's, the wrapper wraps every hook too (BeforeAll, Before, BeforeStep, AfterStep, After,
  # AfterAll), the wrapped hook running on the World; and the wrapped code keeps the original's
  # length, so a callback step under a `(...args)` wrapper still gets its callback. The AfterAll hook
  # reports what it saw in a file beside the project's in node mode (a worker's output after its
  # last test is lost: Vitest's teardown bug), on the console in a page (which can't write files);
  # in a fresh Vitest, whose node worker ends with the run (a kept one's runs it later).
  Scenario Outline: The definition function wrapper wraps every hook, and keeps a callback step's callback (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import {
        After,
        AfterAll,
        AfterStep,
        Before,
        BeforeAll,
        BeforeStep,
        Given,
        setDefinitionFunctionWrapper,
      } from "@cucumber/cucumber";
      import { expect } from "vitest";
      <report>

      interface Seen {
        fromBefore?: boolean;
        called?: boolean;
      }

      const wrapped: string[] = [];
      setDefinitionFunctionWrapper((fn) =>
        function (this: unknown, ...args: unknown[]) {
          wrapped.push(fn.name);
          return fn.apply(this, args);
        },
      );
      BeforeAll(function beforeAll() {});
      Before(function before(this: Seen) {
        this.fromBefore = true;
      });
      BeforeStep(function beforeStep() {});
      AfterStep(function afterStep() {});
      After(function after() {});
      AfterAll(function afterAll() {
        report(`AfterAll saw: ${wrapped.slice(-2).join(", ")}`);
      });
      Given("a callback step", function callbackStep(this: Seen, done: () => void) {
        setTimeout(() => {
          this.called = true;
          done();
        }, 10);
      });
      Given("the wrapper saw {string}", function check(this: Seen, names: string) {
        expect(this.fromBefore).toBe(true);
        expect(wrapped.join(", ")).toBe(names);
      });
      Given("the callback step had ended", function ended(this: Seen) {
        expect(this.called).toBe(true);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: Wrapper
        Scenario: first
          Given a callback step
          Then the callback step had ended

        Scenario: second
          Then the wrapper saw "beforeAll, before, beforeStep, callbackStep, afterStep, beforeStep, ended, afterStep, after, before, beforeStep, check"
      """
    When I run vitest in a fresh Vitest in <mode> mode
    Then it passes
    And <reported> contains:
      """
      AfterAll saw: after, afterAll
      """

    Examples:
      | mode    | report                                                                                                                                       | reported                 |
      | node    | import { writeFileSync } from "node:fs"; const report = (line: string) => writeFileSync(new URL("../after-all.txt", import.meta.url), line); | the file "after-all.txt" |
      | browser | const report = (line: string) => console.log(line);                                                                                          | the output               |

  # A transformer's error fails the step its parameter is in (in a page, main calls the transformer
  # outside any step definition's code).
  Scenario Outline: A parameter type's transformer that throws fails its step, with its error (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { defineParameterType, Given } from "@cucumber/cucumber";

      defineParameterType({
        name: "broken",
        regexp: /broken/,
        transformer: () => {
          throw new Error("Transformer failed");
        },
      });
      Given("a {broken} value", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: Transformer
        Scenario: broken
          Given a broken value
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Transformer > broken" fails with:
      """
      Transformer failed
      """
    And the output contains:
      """
       ❯ features/a.feature:3:5
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Node mode: while the support code loads, an import gets Vitest's mock of cucumber and a `require`
  # the preload's stand-in (both record); after, an import or a `require` is cucumber's own (its
  # definitions refused outside its run, cucumber's error).
  Scenario Outline: The support code's `require` of cucumber, and cucumber itself after loading (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { createRequire } from "node:module";
      import { expect } from "vitest";

      const required: typeof import("@cucumber/cucumber") = createRequire(import.meta.url)(
        "@cucumber/cucumber",
      );
      required.Given("a required step", () => {});

      Given("cucumber is its own now", async () => {
        const imported = await import("@cucumber/cucumber");
        // From the directory whose `require` got the stand-in while loading.
        const required = createRequire(import.meta.url)("@cucumber/cucumber");
        for (const cucumber of [imported, required]) {
          expect(() => cucumber.Given("x", () => {})).toThrow("isn't running");
        }
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: Require
        Scenario: required
          Given a required step
          And cucumber is its own now
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME     | STATUS |
      | required | passed |

    Examples:
      | mode |
      | node |

  # The support code's `@cucumber/cucumber` is the plugin's stand-in, which refuses a definition once
  # the support code has loaded.
  Scenario Outline: A definition made after the support code loaded fails, with the method's name (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step that defines another", () => {
        Given("a late step", () => {});
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: Late
        Scenario: late
          Given a step that defines another
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "Late > late" fails with:
      """
      [@lotun/vitest-cucumber] "Given" was called after the support code loaded
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # In a page the World is built when main's cucumber builds it; its error fails its scenario, as in
  # node mode, even before a step that never uses `this`.
  Scenario Outline: A World whose constructor throws fails its scenarios, with its error (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, setWorldConstructor } from "@cucumber/cucumber";

      setWorldConstructor(
        class {
          constructor() {
            throw new Error("World failed");
          }
        },
      );
      Given("a step that doesn't use its World", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: World
        Scenario: broken
          Given a step that doesn't use its World
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "World > broken" fails with:
      """
      World failed
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's `world` (the running step's or case hook's World) and `context` (the running BeforeAll
  # or AfterAll hook's), as exports, and `defineStep` (a step definition, as `Given`).
  Scenario Outline: The `world` and `context` exports, and `defineStep` (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Before, BeforeAll, context, defineStep, Given, world } from "@cucumber/cucumber";
      import { expect } from "vitest";

      BeforeAll(() => {
        context.parameters.fromBeforeAll = "set";
      });
      Before(function () {
        world.fromBefore = "set";
        expect(world.fromBefore).toBe(this.fromBefore);
      });
      defineStep("a step defined with defineStep", function () {
        expect(world).toMatchObject({ fromBefore: "set" });
        expect(world.parameters).toEqual({ fromBeforeAll: "set" });
        expect(this.parameters).toEqual({ fromBeforeAll: "set" });
      });
      Given("a passing step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: exports
          Given a step defined with defineStep
          And a passing step
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME    | STATUS |
      | exports | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The plugin's own, not cucumber's: an arrow function has no `this`, so one whose first parameter
  # is named `world` (a test run hook's: `context`) gets it there, before cucumber's arguments.
  Scenario Outline: An arrow function whose first parameter is `world` gets the World as that argument (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After, AfterStep, Before, BeforeAll, type DataTable, Given, type IContext, setWorldConstructor, Then, When, World } from "@cucumber/cucumber";
      import { expect } from "vitest";

      class Cart extends World {
        items: string[] = [];
        trail: string[] = [];
      }
      setWorldConstructor(Cart);

      BeforeAll((context: IContext) => {
        context.parameters.fromBeforeAll = "set";
      });
      Before((world: Cart, { pickle }) => {
        expect(world).toBeInstanceOf(Cart);
        world.trail.push(`Before ${pickle.name}`);
      });
      AfterStep((world: Cart, { result }) => {
        world.trail.push(result.status);
      });
      After((world: Cart, { result }, done: () => void) => {
        expect(result?.status).toBe("PASSED");
        expect(world.trail).toEqual(["Before arrows", "PASSED", "PASSED", "PASSED", "PASSED", "PASSED"]);
        setTimeout(done, 10);
      });
      Given("a cart with {string}", (world: Cart, item: string) => {
        world.items.push(item);
      });
      When("I add {int} of each:", async (world: Cart, count: number, table: DataTable) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        for (const [item] of table.raw()) {
          world.items.push(...Array.from({ length: count }, () => item));
        }
      });
      When("I add {string} later", (world: Cart, item: string, done: () => void) => {
        setTimeout(() => {
          world.items.push(item);
          done();
        }, 10);
      });
      // Cucumber's own, next to them: `this`, and an arrow function with its callback.
      Then("the cart has {int} items", function (this: Cart, count: number) {
        expect(this.items).toHaveLength(count);
        expect(this.parameters).toEqual({ fromBeforeAll: "set" });
      });
      Then("{string} is a word", (word: string, done: () => void) => {
        expect(word).toBe("fig");
        done();
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: arrows
          Given a cart with "apple"
          When I add 2 of each:
            | kiwi |
            | lime |
          And I add "fig" later
          Then the cart has 6 items
          And "fig" is a word
      """
    When I run vitest in <mode> mode
    Then it passes
    And it runs the scenarios:
      | NAME   | STATUS |
      | arrows | passed |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # A monorepo's shared steps, built (`packages/<name>/dist/`): their locations are theirs. Vitest's
  # default frame filter drops `/packages/<name>/dist/` (its own packages, run from source): the
  # plugin locates definitions without it, in every mode.
  Scenario Outline: Step definitions in a monorepo package's `dist/` are located there (<mode>)
    Given the plugin options:
      """
      { "import": ["packages/steps/dist/**/*.js"] }
      """
    And a file named "packages/steps/dist/steps.js" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a pending step", () => "pending");
      """
    And a file named "features/shared.feature" with:
      """
      Feature: Shared
        Scenario: shared step
          Given a pending step
      """
    When I run vitest in <mode> mode
    Then it fails
    And the output contains:
      """
      Pending steps:
        Given a pending step # packages/steps/dist/steps.js:3
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
