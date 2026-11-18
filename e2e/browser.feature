Feature: The page
  In browser mode, steps run in the page: they can render and interact with it.

  Scenario: Steps render and click in the page
    Given a file named "features/steps.ts" with:
      """
      import { Given, Then, When } from "@cucumber/cucumber";
      import { expect } from "vitest";
      import { page, userEvent } from "vitest/browser";

      Given("a counter widget is rendered", () => {
        let count = 0;
        document.body.innerHTML =
          '<button type="button">Increment</button><output>0</output>';
        const output = document.querySelector("output")!;
        document.querySelector("button")!.addEventListener("click", () => {
          count += 1;
          output.textContent = String(count);
        });
      });

      When("I click the {string} button", async (label: string) => {
        await userEvent.click(page.getByRole("button", { name: label }));
      });

      Then("the count should be {int}", async (expected: number) => {
        await expect
          .element(page.getByRole("status"))
          .toHaveTextContent(String(expected));
      });
      """
    And a file named "features/counter.feature" with:
      """
      Feature: Counter
        Scenario: Clicking a button updates the counter
          Given a counter widget is rendered
          When I click the "Increment" button
          And I click the "Increment" button
          Then the count should be 2
      """
    When I run vitest in browser mode
    Then it passes
    And it runs the scenarios:
      | NAME                                  | STATUS |
      | Clicking a button updates the counter | passed |

  Scenario: A page that dies mid run fails it, instead of the run waiting for it
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the page reloads", () => {
        location.reload();
        return new Promise(() => {});
      });

      Given("a step", () => {});
      """
    And a file named "features/reload.feature" with:
      """
      Feature: Reload
        Scenario: reloads its page
          Given the page reloads
      """
    And a file named "features/next.feature" with:
      """
      Feature: Next
        Scenario: passes
          Given a step
      """
    # Not a kept Vitest: its browser pool can leave the reload's rejection unhandled (Vitest's bug,
    # see `notes/issues.md` 3a); options always start a fresh one. Two pages: the other file runs
    # in the one that lives (with one page, it's queued behind the dead page, and never runs).
    When I run vitest in browser mode with options:
      """
      { "maxWorkers": 2 }
      """
    Then it fails
    And the feature file "features/next.feature" passes

  Scenario: Every instance of a browser config runs the scenarios, with the same support code
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
          include: ["features/**/*.feature"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: "chromium", name: "one" },
              { browser: "chromium", name: "two" },
            ],
            screenshotFailures: false,
          },
        },
      };
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      Given("a step", () => {});
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a passes
          Given a step
      """
    And a file named "features/b.feature" with:
      """
      Feature: B
        Scenario: b passes
          Given a step
      """
    When I run vitest
    Then it passes
    And Vitest reports the tests:
      | NAME         | STATE  |
      | A > a passes | passed |
      | A > a passes | passed |
      | B > b passes | passed |
      | B > b passes | passed |

  # Each instance runs its own scenarios with the support code: its BeforeAll hooks before them, a
  # World and its hooks per scenario, its attachments its own tests' annotations.
  Scenario: Every instance of a browser config runs the hooks, Worlds and attachments of its scenarios
    Given the Vitest config:
      """
      import { cucumber } from "@lotun/vitest-cucumber";
      import { playwright } from "@vitest/browser-playwright";

      export default {
        plugins: [
          cucumber({ import: ["features/**/*.ts"] }),
        ],
        test: {
          include: ["features/**/*.feature"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: "chromium", name: "one" },
              { browser: "chromium", name: "two" },
            ],
            screenshotFailures: false,
          },
        },
      };
      """
    And a file named "features/steps.ts" with:
      """
      import { Before, BeforeAll, Given, World } from "@cucumber/cucumber";

      let ready = false;
      BeforeAll(() => {
        ready = true;
      });
      Before(function (this: World & { greeting?: string }) {
        this.greeting = "hello";
        this.log("from Before");
      });
      Given("a step", function (this: World & { greeting?: string }) {
        if (!ready || this.greeting !== "hello") {
          throw new Error(`ready: ${String(ready)}, greeting: ${String(this.greeting)}`);
        }
        this.log("from the step");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: a passes
          Given a step
      """
    When I run vitest
    Then it passes
    And Vitest reports the tests:
      | NAME         | STATE  |
      | A > a passes | passed |
      | A > a passes | passed |
    And each test "A > a passes" has the annotations:
      | TYPE | MESSAGE       |
      | log  | from Before   |
      | log  | from the step |

  # A page's `attach` is a copy of cucumber's (its string branch): bytes fail, as base64 they don't.
  Scenario: Bytes fail their step in a page, with the plugin's error
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      Given("a step that attaches bytes", function (this: World) {
        this.attach(new Uint8Array([98, 121, 116, 101, 115]) as never, "application/octet-stream");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: bytes
          Given a step that attaches bytes
      """
    When I run vitest in browser mode
    Then it fails
    And the scenario "bytes" fails with:
      """
      Invalid attachment data: must be a string
      """
