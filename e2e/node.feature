Feature: Node mode
  What only node mode has: the support code runs in a Vitest worker, a Node process, so a World's
  `attach` takes Node's data too, as cucumber's does (`src/worker/node/attachmentManager.ts`): a
  `Buffer`, attached as base64, and a readable stream, read to its end. A page has neither
  (`browser.feature`). What every mode has is in the other features.

  Scenario: A Buffer is attached as base64
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";

      Given("a step that attaches a Buffer", function (this: World) {
        this.attach(Buffer.from("bytes"), "application/octet-stream");
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: buffer
          Given a step that attaches a Buffer
      """
    When I run vitest in node mode
    Then it passes
    And the test "A > buffer" has the annotations:
      | TYPE       | MESSAGE                  | CONTENT TYPE             |
      | attachment | application/octet-stream | application/octet-stream |

  # Cucumber's `attach` of a stream returns a promise, unless it's given a callback, which it calls
  # once the stream ended.
  Scenario: A readable stream is attached once read, awaited or with a callback
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";
      import { Readable } from "node:stream";

      Given("a step that awaits a stream's attachment", async function (this: World) {
        await this.attach(Readable.from([Buffer.from("str"), Buffer.from("eam")]), {
          mediaType: "text/plain",
          fileName: "awaited.txt",
        });
      });

      Given("a step that attaches a stream with a callback", function (this: World, done: () => void) {
        this.attach(Readable.from([Buffer.from("str"), Buffer.from("eam")]), "text/plain", done);
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: streams
          Given a step that awaits a stream's attachment
          And a step that attaches a stream with a callback
      """
    When I run vitest in node mode
    Then it passes
    And the test "A > streams" has the annotations:
      | TYPE       | MESSAGE     | CONTENT TYPE |
      | attachment | awaited.txt | text/plain   |
      | attachment | text/plain  | text/plain   |

  # Cucumber's errors: a Buffer's or a stream's media type can't be guessed.
  Scenario Outline: A <data> without a media type fails its step
    Given a file named "features/steps.ts" with:
      """
      import { Given, World } from "@cucumber/cucumber";
      import { Readable } from "node:stream";

      Given("a step that attaches a Buffer", function (this: World) {
        this.attach(Buffer.from("bytes"));
      });

      Given("a step that attaches a stream", function (this: World) {
        return this.attach(Readable.from(["stream"]));
      });
      """
    And a file named "features/a.feature" with:
      """
      Feature: A
        Scenario: untyped
          Given a step that attaches a <data>
      """
    When I run vitest in node mode
    Then it fails
    And the scenario "untyped" fails with:
      """
      <message>
      """

    Examples:
      | data   | message                                      |
      | Buffer | Buffer attachments must specify a media type |
      | stream | Stream attachments must specify a media type |
