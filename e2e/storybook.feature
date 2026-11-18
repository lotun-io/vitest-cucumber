Feature: Storybook
  A Storybook project as a user's (its files below, in `tmp/e2e/<scenario>/`; Storybook, React and the
  plugin from `src/` through `storybook/`'s `node_modules`): its feature files are its stories (listed
  in Storybook's `stories`), each a stories module of its own, on the stories file next to it: a story
  per scenario and Outline row, on the story its Storybook step names (`Given the LogIn story`), else on
  the meta, listed under the stories file's title then the feature's (`Cucumber/Login/Feature:
  Login`). The stories files are ordinary ones, never changed. `Checks` end a scenario one way without
  failing (skipped, logging, after BeforeAll); `Failures` fail one way each (failing, undefined,
  pending, ambiguous); `Attachments` attach, `Hooks` run Before and After hooks (one failing), `Args`
  are an Outline's rows, each on its own story (its `args`), `Account` a Markdown feature, `Story`
  a step reading its story, a story's own `play` not run, an unmounted story a step mounts. Every case
  but the ones breaking the page (those: `storybookErrors.feature`), in one project: its story tests
  (Vitest) and its preview (a static build) each compared with what's expected.

  Background:
    Given a Storybook project
    And a file named "src/Page.tsx" with:
      """
      import React, { useState } from "react";

      /** A page with a user to log in, sign up or log out (Jane Doe). */
      export const Page = () => {
        const [user, setUser] = useState<string>();
        return user ? (
          <div>
            <p>Welcome, {user}!</p>
            <button type="button" onClick={() => setUser(undefined)}>Log out</button>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setUser("Jane Doe")}>Log in</button>
            <button type="button" onClick={() => setUser("Jane Doe")}>Sign up</button>
          </div>
        );
      };
      """
    And a file named "src/Greeting.tsx" with:
      """
      import React from "react";

      /** A greeting of `name`: what a story's `args` set. */
      export const Greeting: React.FC<{ name: string }> = ({ name }) => (
        <p>Hello, {name}</p>
      );
      """
    And a file named "src/Login.stories.ts" with:
      """
      import type { Meta, StoryObj } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Login.feature`, next to it: its meta is the feature's stories', and its
      // `LogIn` story the one a scenario names (its tags with the scenario's).
      const meta = {
        title: "Cucumber/Login",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      type Story = StoryObj<typeof meta>;

      /** The story `Log in` runs on: its tags merged with the scenario's. */
      export const LogIn: Story = { tags: ["smoke"] };

      /** An ordinary story: no scenario names it, it's no story test of the feature. */
      export const JustThePage: Story = {};
      """
    And a file named "src/Account.stories.ts" with:
      """
      import type { Meta } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Account.feature.md` (a Markdown feature), next to it: its meta only.
      const meta = {
        title: "Cucumber/Account",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      """
    And a file named "src/Failures.stories.ts" with:
      """
      import type { Meta } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Failures.feature`: its meta, every scenario's (each failing on purpose).
      const meta = {
        title: "Failures",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      """
    And a file named "src/Checks.stories.ts" with:
      """
      import type { Meta } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Checks.feature`: its meta, every scenario's.
      const meta = {
        title: "Checks",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      """
    And a file named "src/Attachments.stories.ts" with:
      """
      import type { Meta } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Attachments.feature`: its meta, every scenario's.
      const meta = {
        title: "Attachments",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      """
    And a file named "src/Hooks.stories.ts" with:
      """
      import type { Meta } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Hooks.feature`: its meta, every scenario's (its hooks around it).
      const meta = {
        title: "Hooks",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      """
    And a file named "src/Args.stories.ts" with:
      """
      import type { Meta, StoryObj } from "@storybook/react-vite";
      import { Greeting } from "./Greeting";

      // The stories file of `Args.feature`: each Outline row runs on one of these stories, its `args`
      // its own (its `story` column, the row's Storybook step).
      const meta = {
        title: "Args",
        component: Greeting,
      } satisfies Meta<typeof Greeting>;

      export default meta;
      type Story = StoryObj<typeof meta>;

      export const GreetingAda: Story = { args: { name: "Ada" } };
      export const GreetingGrace: Story = { args: { name: "Grace" } };
      """
    And a file named "src/Story.stories.ts" with:
      """
      import type { Meta, StoryObj } from "@storybook/react-vite";
      import { Page } from "./Page";

      // The stories file of `Story.feature`: a story with a `play` of its own, which a scenario on it
      // doesn't run (its own test), and the page, which an unmounted scenario's step mounts.
      const meta = {
        title: "Story",
        component: Page,
      } satisfies Meta<typeof Page>;

      export default meta;
      type Story = StoryObj<typeof meta>;

      export const WithItsOwnPlay: Story = {
        beforeEach: () => {
          Object.assign(globalThis, { ownPlayRan: false });
        },
        play: async () => {
          Object.assign(globalThis, { ownPlayRan: true });
        },
      };

      export const ThePage: Story = {};
      """
    And a file named "src/Login.feature" with:
      """
      Feature: Login
        The page of `Login.stories.ts`: `Log in` on its `LogIn` story, the others on its meta. Storybook
        renders the story, its play runs this.

        Background:
          Given I see the "Log in" button

        Scenario: Log in
          Given the LogIn story
          When I click the "Log in" button
          Then I see the "Log out" button
          And I see the text "Jane Doe"

        Scenario Outline: Sign up then log out with <first>
          When I click the "<first>" button
          And I click the "Log out" button
          Then I see the "Log in" button

          Examples:
            | first   |
            | Log in  |
            | Sign up |
      """
    And a file named "src/Account.feature.md" with:
      """
      # Feature: Account

      The same steps as `Login.feature`, written as Markdown (cucumber's `.feature.md`): each scenario on
      the meta of `Account.stories.ts`.

      ## Background:

      * Given I see the "Log in" button

      ## Scenario: Sign up

      * When I click the "Sign up" button
      * Then I see the "Log out" button
      * And I see the text "Jane Doe"

      ## Scenario Outline: Log out after <button>

      * When I click the "<button>" button
      * And I click the "Log out" button
      * Then I see the "Log in" button

      ### Examples:

        | button  |
        | ------- |
        | Log in  |
        | Sign up |

      ## Rule: A signed-up user can log out

      ### Background:

      * When I click the "Sign up" button

      ### Scenario: Log out after signing up

      * When I click the "Log out" button
      * Then I see the "Log in" button
      """
    And a file named "src/Failures.feature" with:
      """
      Feature: Failures
        Each scenario is one way a story's scenario fails; the e2e suite (`e2e/storybook.feature`)
        compares what Vitest and Storybook's preview show for each with what's expected.

        Scenario: Failing
          Given I see the "Log in" button
          Then I see the "Nope" button

        Scenario: Undefined
          Given a step nobody defined

        Scenario: Pending
          Given a pending step

        Scenario: Ambiguous
          Given an ambiguous step
      """
    And a file named "src/Checks.feature" with:
      """
      Feature: Checks
        Each scenario is one way a story's scenario ends without failing; the e2e suite
        (`e2e/storybook.feature`) compares what Vitest and Storybook's preview show for each with what's
        expected. The ones that fail on purpose: `Failures.feature`.

        Scenario: Skipped
          Given a skipped step

        Scenario: Logging
          Given a logging step
          Then I see the "Log in" button

        Scenario: BeforeAll ran
          Then the BeforeAll hook ran first
      """
    And a file named "src/Attachments.feature" with:
      """
      Feature: Attachments
        A step's attachments, logs and links (`this.attach`, `this.log`, `this.link`), as
        `e2e/attachments.feature` attaches them in node and browser mode: in story tests the test's Vitest
        annotations; in Storybook's preview a failed story's notes, after its steps (a passing story's
        aren't shown).

        Scenario: Attaching
          Given a step that attaches

        Scenario: Attaching, then failing
          Given a step that attaches
          Then I see the "Nope" button
      """
    And a file named "src/Hooks.feature" with:
      """
      Feature: Hooks
        A scenario's Before and After hooks run in its story's play, around its steps (tagged hooks:
        `features/hooks.ts`); a failing Before hook fails the story, its steps skipped.

        @hooks
        Scenario: Before and After
          Given a logging step

        @failingBefore
        Scenario: A failing Before hook
          Given I see the "Log in" button
      """
    And a file named "src/Args.feature" with:
      """
      Feature: Args
        An Outline, each row on its own story of `Args.stories.ts` (its Storybook step, from the `story`
        column), with its own `args`: its steps read the running story's (`story()`), each story's
        component rendered with its own.

        Scenario Outline: Greeting <name>
          Given the <story> story
          Then I see the greeting of the story's name

          Examples:
            | name  | story         |
            | Ada   | GreetingAda   |
            | Grace | GreetingGrace |
      """
    And a file named "src/Story.feature" with:
      """
      Feature: Story
        A step reads its story (`story()`); a story's own `play` doesn't run in a scenario on it; an
        unmounted story is rendered by a step, not before the steps.

        Scenario: The running story
          Then the story is named "The running story"

        Scenario: Its own play
          Given the WithItsOwnPlay story
          Then the story's own play didn't run

        Scenario: Unmounted
          Given the unmounted ThePage story
          Then I see no button
          When I mount the story
          Then I see the "Log in" button
      """
    And a file named "features/world.ts" with:
      """
      import { setWorldConstructor, World } from "@cucumber/cucumber";
      import { story } from "@lotun/vitest-cucumber/storybook";
      import type { StoryContext } from "@storybook/react-vite";

      /** The World of story-driven scenarios: `this.story` is the running story's context. */
      export class StoryWorld extends World<{ beforeAll: boolean }> {
        get story() {
          return story<StoryContext>();
        }
      }

      setWorldConstructor(StoryWorld);
      """
    And a file named "features/steps.ts" with:
      """
      // The story is already rendered by Storybook (unless it's unmounted): steps drive it through its
      // context. The Storybook steps link a scenario to a story (the plugin's parameter types: they do
      // nothing here).
      import { Given, Then, When } from "@cucumber/cucumber";
      import { expect } from "storybook/test";
      import type { StoryWorld } from "./world.ts";

      Given("the {storybook:story} story", (_story: string) => {});
      Given("the unmounted {storybook:storyUnmounted} story", (_story: string) => {});

      When("I mount the story", async function (this: StoryWorld) {
        await this.story.mount();
      });

      Then("I see no button", async function (this: StoryWorld) {
        await expect(this.story.canvas.queryByRole("button")).toBeNull();
      });

      Then("the story is named {string}", function (this: StoryWorld, name: string) {
        expect(this.story.name).toBe(name);
      });

      Then("the story's own play didn't run", () => {
        expect(Reflect.get(globalThis, "ownPlayRan")).toBe(false);
      });

      When(
        "I click the {string} button",
        async function (this: StoryWorld, name: string) {
          const { canvas, userEvent } = this.story;
          await userEvent.click(canvas.getByRole("button", { name }));
        },
      );

      Then(
        "I see the {string} button",
        async function (this: StoryWorld, name: string) {
          await expect(
            this.story.canvas.getByRole("button", { name }),
          ).toBeInTheDocument();
        },
      );

      Then(
        "I see the text {string}",
        async function (this: StoryWorld, text: string) {
          await expect(
            this.story.canvas.getByText(text, { exact: false }),
          ).toBeInTheDocument();
        },
      );
      """
    And a file named "features/checks.ts" with:
      """
      // The checks' own steps and hook (`../src/Checks.feature`, `../src/Failures.feature`).
      import { BeforeAll, Given, Then } from "@cucumber/cucumber";
      import { expect } from "storybook/test";
      import type { StoryWorld } from "./world.ts";

      // A page's BeforeAll runs before its first scenario: its world parameters say so.
      BeforeAll(function (this) {
        this.parameters.beforeAll = true;
      });

      Given("a pending step", () => "pending");

      Given("a skipped step", () => "skipped");

      Given("a logging step", function (this: StoryWorld) {
        this.log("hello from the step");
      });

      Then("the BeforeAll hook ran first", function (this: StoryWorld) {
        expect(this.parameters.beforeAll).toBe(true);
      });

      // Two definitions of one step: it's ambiguous.
      Given("an ambiguous step", () => undefined);
      Given(/^an ambiguous step$/, () => undefined);
      """
    And a file named "features/hooks.ts" with:
      """
      // The hooks' own hooks and steps (`../src/Hooks.feature`, `../src/Args.feature`).
      import { After, Before, Then } from "@cucumber/cucumber";
      import { expect } from "storybook/test";
      import type { StoryWorld } from "./world.ts";

      Before({ tags: "@hooks" }, function (this: StoryWorld) {
        this.log("before hook");
      });

      After({ tags: "@hooks" }, function (this: StoryWorld) {
        this.log("after hook");
      });

      Before({ tags: "@failingBefore" }, () => {
        throw new Error("Before hook failed on purpose");
      });

      Then(
        "I see the greeting of the story's name",
        async function (this: StoryWorld) {
          const { args, canvas } = this.story;
          await expect(
            canvas.getByText(`Hello, ${String(args.name)}`),
          ).toBeInTheDocument();
        },
      );
      """
    And a file named "features/attachments.ts" with:
      """
      // The attachments' own step (`../src/Attachments.feature`): what `e2e/attachments.feature`'s step
      // attaches in node and browser mode.
      import { Given } from "@cucumber/cucumber";
      import type { StoryWorld } from "./world.ts";

      Given("a step that attaches", function (this: StoryWorld) {
        this.log("a log line");
        this.attach("some text", "text/plain");
        this.attach(JSON.stringify({ ok: true }), "application/json");
        this.attach("iVBORw0KGgo=", "base64:image/png");
        this.attach("named", { mediaType: "text/plain", fileName: "report.txt" });
        this.attach("iVBORw0KGgo=", {
          mediaType: "base64:image/png",
          fileName: "pixel.png",
        });
        this.link("https://example.com/report");
      });
      """

  # The addon's Vitest project: each feature file its scenarios' test file, each scenario or Outline
  # row a test named as node and browser mode name it (`Feature > Rule > Outline > row`); a stories
  # file's own stories aren't the features' tests (Storybook's `stories` lists the features only).
  Scenario: Its story tests
    When I run vitest
    Then it fails
    And Vitest reports the tests:
      | NAME                                                                          | STATE   |
      | Login > Log in                                                                | passed  |
      | Login > Sign up then log out with <first> > Sign up then log out with Log in  | passed  |
      | Login > Sign up then log out with <first> > Sign up then log out with Sign up | passed  |
      | Account > Sign up                                                             | passed  |
      | Account > Log out after <button> > Log out after Log in                       | passed  |
      | Account > Log out after <button> > Log out after Sign up                      | passed  |
      | Account > A signed-up user can log out > Log out after signing up             | passed  |
      | Failures > Failing                                                            | failed  |
      | Failures > Undefined                                                          | failed  |
      | Failures > Pending                                                            | failed  |
      | Failures > Ambiguous                                                          | failed  |
      | Checks > Skipped                                                              | skipped |
      | Checks > Logging                                                              | passed  |
      | Checks > BeforeAll ran                                                        | passed  |
      | Attachments > Attaching                                                       | passed  |
      | Attachments > Attaching, then failing                                         | failed  |
      | Hooks > Before and After                                                      | passed  |
      | Hooks > A failing Before hook                                                 | failed  |
      | Args > Greeting <name> > Greeting Ada                                         | passed  |
      | Args > Greeting <name> > Greeting Grace                                       | passed  |
      | Story > The running story                                                     | passed  |
      | Story > Its own play                                                          | passed  |
      | Story > Unmounted                                                             | passed  |
    And the test "Failures > Failing" fails with:
      """
      Unable to find an accessible element with the role "button" and name "Nope"
      """
    And the test "Failures > Undefined" fails with:
      """
      Undefined steps:
      """
    And the test "Failures > Pending" fails with:
      """
      Pending steps:
      """
    And the test "Failures > Ambiguous" fails with:
      """
      Ambiguous steps:
      """
    And the test "Hooks > A failing Before hook" fails with:
      """
      Before hook failed on purpose
      """
    And the test "Attachments > Attaching" has the annotations:
      | TYPE       | MESSAGE                    | CONTENT TYPE     |
      | log        | a log line                 |                  |
      | attachment | text/plain                 | text/plain       |
      | attachment | application/json           | application/json |
      | attachment | image/png                  | image/png        |
      | attachment | report.txt                 | text/plain       |
      | attachment | pixel.png                  | image/png        |
      | link       | https://example.com/report |                  |
    And the test "Attachments > Attaching, then failing" has the annotations:
      | TYPE       | MESSAGE                    | CONTENT TYPE     |
      | log        | a log line                 |                  |
      | attachment | text/plain                 | text/plain       |
      | attachment | application/json           | application/json |
      | attachment | image/png                  | image/png        |
      | attachment | report.txt                 | text/plain       |
      | attachment | pixel.png                  | image/png        |
      | link       | https://example.com/report |                  |
    And the test "Hooks > Before and After" has the annotations:
      | TYPE | MESSAGE             | CONTENT TYPE |
      | log  | before hook         |              |
      | log  | hello from the step |              |
      | log  | after hook          |              |

  # Storybook's own preview, in a static build: cucumber runs in the page, no server. Each story
  # opened in Storybook's UI (Playwright, `e2e/support/storybookStatic.ts`), its Interactions panel
  # read for its status, each text it shows, and a text it hides (a passing story's notes).
  Scenario: Its preview, in a static build
    When I build its Storybook
    Then its stories show:
      | STORY                                                           | STATUS | SHOWS                                                                       | HIDES           |
      | cucumber-login-feature-login--log-in                            | PASS   | Given I see the "Log in" button                                             |                 |
      | cucumber-login-feature-login--log-in                            | PASS   | Then I see the "Log out" button                                             |                 |
      | cucumber-login-feature-login--sign-up-then-log-out-with-log-in  | PASS   | When I click the "Log in" button                                            |                 |
      | cucumber-login-feature-login--sign-up-then-log-out-with-sign-up | PASS   | When I click the "Sign up" button                                           |                 |
      | cucumber-account-feature-account--log-out-after-log-in          | PASS   | When I click the "Log in" button                                            |                 |
      | cucumber-account-feature-account--log-out-after-signing-up      | PASS   | When I click the "Sign up" button                                           |                 |
      | failures-feature-failures--failing                              | FAIL   | Then I see the "Nope" button                                                |                 |
      | failures-feature-failures--failing                              | FAIL   | Unable to find an accessible element with the role "button" and name "Nope" |                 |
      | failures-feature-failures--undefined                            | FAIL   | Undefined steps:                                                            |                 |
      | failures-feature-failures--pending                              | FAIL   | Pending steps:                                                              |                 |
      | checks-feature-checks--skipped                                  | PASS   | Skipped                                                                     |                 |
      | checks-feature-checks--logging                                  | PASS   | Given a logging step                                                        |                 |
      | checks-feature-checks--before-all-ran                           | PASS   | Then the BeforeAll hook ran first                                           |                 |
      | attachments-feature-attachments--attaching                      | PASS   | Given a step that attaches                                                  | log: a log line |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | log: a log line                                                             |                 |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | attachment: text/plain                                                      |                 |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | attachment: application/json                                                |                 |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | attachment: image/png                                                       |                 |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | attachment: report.txt                                                      |                 |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | attachment: pixel.png                                                       |                 |
      | attachments-feature-attachments--attaching-then-failing         | FAIL   | link: https://example.com/report                                            |                 |
      | failures-feature-failures--ambiguous                            | FAIL   | Ambiguous steps:                                                            |                 |
      | hooks-feature-hooks--before-and-after                           | PASS   | Given a logging step                                                        |                 |
      | hooks-feature-hooks--a-failing-before-hook                      | FAIL   | Before hook failed on purpose                                               |                 |
      | args-feature-args--greeting-ada                                 | PASS   | Then I see the greeting of the story's name                                 |                 |
      | args-feature-args--greeting-grace                               | PASS   | Then I see the greeting of the story's name                                 |                 |
      | story-feature-story--the-running-story                          | PASS   | Then the story is named "The running story"                                 |                 |
      | story-feature-story--its-own-play                               | PASS   | Then the story's own play didn't run                                        |                 |
      | story-feature-story--unmounted                                  | PASS   | When I mount the story                                                      |                 |
