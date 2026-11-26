Feature: Attachments
  A step's or a hook's attachments (`this.attach`), logs (`this.log`) and links (`this.link`) are
  its test's Vitest annotations, in order: a log (`log`) and a link (`link`) as their text, any
  other attachment (`attachment`) as its file name, or else its media type (never its data, which a
  terminal would print whole), with the attachment itself. Vitest's default reporter prints a failed test's, its verbose
  reporter every
  test's, the others (JUnit, HTML, UI) report them too. In a page an attachment is a string (binary
  data as base64, its media type `base64:…`): there's no `Buffer` or Node stream. Node mode's own
  (`Buffer`, streams) are in `node.feature`, a page's bytes in `browser.feature`.

  Scenario Outline: A step's attachments, logs and links are its test's annotations (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      Given("a step that attaches", (world: World) => {
        world.log("a log line");
        world.attach("some text", "text/plain");
        world.attach(JSON.stringify({ ok: true }), "application/json");
        world.attach("iVBORw0KGgo=", "base64:image/png");
        world.attach("named", { mediaType: "text/plain", fileName: "report.txt" });
        world.attach("iVBORw0KGgo=", { mediaType: "base64:image/png", fileName: "pixel.png" });
        world.link("https://example.com/report");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: attaching
          Given a step that attaches
      """
    When I run vitest in <mode> mode
    Then it passes
    And the test "A > attaching" has the annotations:
      | TYPE       | MESSAGE                    | CONTENT TYPE     |
      | log        | a log line                 |                  |
      | attachment | text/plain                 | text/plain       |
      | attachment | application/json           | application/json |
      | attachment | image/png                  | image/png        |
      | attachment | report.txt                 | text/plain       |
      | attachment | pixel.png                  | image/png        |
      | link       | https://example.com/report |                  |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  Scenario Outline: A hook's attachments are its scenario's annotations, in order (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { After, Before, Given, World } from "@cucumber/cucumber";

      Before(async (world: World) => {
        await world.log("from Before");
      });
      After(async (world: World) => {
        await world.log("from After");
      });
      Given("a step", async (world: World) => {
        await world.log("from the step");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: hooked
          Given a step
      """
    When I run vitest in <mode> mode
    Then it passes
    And the test "A > hooked" has the annotations:
      | TYPE | MESSAGE       |
      | log  | from Before   |
      | log  | from the step |
      | log  | from After    |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Annotated before the test fails, so the default reporter prints them with its error; cucumber's
  # summary of a pending step leaves them out (they'd show twice).
  Scenario Outline: A failing or pending scenario's annotations are printed with its error (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      Given("a step that logs and fails", (world: World) => {
        world.log("logged before failing");
        throw new Error("Step failed");
      });
      Given("a step that logs and is pending", (world: World) => {
        world.log("logged while pending");
        return "pending";
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: failing
          Given a step that logs and fails

        Scenario: pending
          Given a step that logs and is pending
      """
    When I run vitest in <mode> mode
    Then it fails
    And the test "A > failing" has the annotations:
      | TYPE | MESSAGE               |
      | log  | logged before failing |
    And the test "A > pending" has the annotations:
      | TYPE | MESSAGE              |
      | log  | logged while pending |
    And the output contains:
      """
      ↳ logged before failing
      """
    And the output contains:
      """
      Pending steps:
        Given a step that logs and is pending # features/steps.ts:7
      """
    And the output contains:
      """
      ↳ logged while pending
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Cucumber's error in node mode, the page's (its copy's) in browser mode.
  Scenario Outline: An attachment that isn't data fails its step (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      Given("a step that attaches an object", (world: World) => {
        world.attach({ not: "data" } as never, "application/json");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: invalid
          Given a step that attaches an object
      """
    When I run vitest in <mode> mode
    Then it fails
    And the scenario "invalid" fails with:
      """
      Invalid attachment data: must be a
      """

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # The check throws in the call, in both modes: a `try` around it catches it.
  Scenario Outline: An attachment's error the step catches doesn't fail it (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      Given("a step that catches its attachment's error", async (world: World) => {
        try {
          await world.attach({ not: "data" } as never, "application/json");
        } catch {
          world.log("caught");
        }
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: caught
          Given a step that catches its attachment's error
      """
    When I run vitest in <mode> mode
    Then it passes
    And the test "A > caught" has the annotations:
      | TYPE | MESSAGE |
      | log  | caught  |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # Vitest keeps a test's annotations across its attempts: a retried scenario has each attempt's, in
  # order (a failed attempt's logs too, as cucumber's messages have each attempt's attachments).
  Scenario Outline: A retried scenario has each attempt's attachments, in order (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      let attempt = 0;
      Given("a flaky step that logs", (world: World) => {
        attempt++;
        world.log(`attempt ${attempt}`);
        if (attempt === 1) {
          throw new Error("Flaky");
        }
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: flaky
          Given a flaky step that logs
      """
    When I run vitest in <mode> mode with options:
      """
      { "retry": 2 }
      """
    Then it passes
    And the scenario "flaky" is attempted 2 times
    And the test "A > flaky" has the annotations:
      | TYPE | MESSAGE   |
      | log  | attempt 1 |
      | log  | attempt 2 |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |

  # As in cucumber, where each test case has its own attachment manager: a World attaches only while
  # a step or hook of its own scenario runs. A timed-out step's later `log` throws cucumber's error,
  # which fails the step running then (an uncaught error), not adding to its scenario. Its timer
  # logs once the next step has started (a flag of the steps' module: each scenario has its own
  # World), so the log falls in it at any load (a story test renders its story first).
  Scenario Outline: A timed-out step's later attachment fails the next scenario, not adding to it (<mode>)
    Given a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";

      let nextStarted = false;

      Given("a step that times out and logs later", { timeout: 50 }, (world) => {
        const poll = setInterval(() => {
          if (nextStarted) {
            clearInterval(poll);
            world.log("late log");
          }
        }, 10);
        return new Promise(() => {});
      });
      Given("a step that takes 1 s", () => {
        nextStarted = true;
        return new Promise((resolve) => setTimeout(resolve, 1000));
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: timing out
          Given a step that times out and logs later

        Scenario: next
          Given a step that takes 1 s
      """
    When I run vitest in <mode> mode
    Then it fails
    And Vitest reports the tests:
      | NAME           | STATE  |
      | A > timing out | failed |
      | A > next       | failed |
    And the test "A > next" fails with:
      """
      Cannot attach when a step/hook is not running. Ensure your step/hook waits for the attach to finish.
      """
    And the test "A > next" has the annotations:
      | TYPE | MESSAGE | CONTENT TYPE |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
