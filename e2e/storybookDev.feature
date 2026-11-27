Feature: Storybook's dev server
  `storybook dev` on a Storybook project of the scenario's own (`tmp/e2e/<scenario>/`), a page of
  its preview open: what it shows and what Storybook's index has follow the project's files as they
  are saved, where Storybook and Vite can't know to (a feature's stories module is made from its
  stories file and the Storybook steps too; a stories file's features are shown by `featuresOf`).
  Nothing is touched on disk for it: only the saved file has a new time. The stories file is not one
  of Storybook's `stories` (the feature files are): Storybook's own watcher never sees it change.

  Background:
    Given a Storybook project
    And a file named "lib/helper.ts" with:
      """
      export const marker = "one";
      """
    And a file named "features/steps.ts" with:
      """
      import { Given } from "@cucumber/cucumber";
      import { marker } from "../lib/helper.ts";

      Given("the {storybook:story} story", (_story: string) => {});
      Given("the stories of {storybook:storiesFile}", (_file: string) => {});
      Given("the helper's marker", () => {
        const paragraph = document.createElement("p");
        paragraph.textContent = `the helper says ${marker}`;
        document.body.append(paragraph);
      });
      """
    # A card: its label, and the features that run on this stories file, read as a docs block reads
    # them (the two-line hook on `featuresOf` and `onFeaturesChange`).
    And a file named "src/Card.stories.ts" with:
      """
      import { featuresOf, onFeaturesChange } from "@lotun/vitest-cucumber/storybook";
      import { createElement, useSyncExternalStore } from "react";

      const Card = ({ label }: { label: string }) => {
        const features = useSyncExternalStore(onFeaturesChange, () =>
          featuresOf("./src/Card.stories.ts"),
        );
        return createElement(
          "div",
          null,
          createElement("h1", null, label),
          createElement("pre", null, features.map(({ source }) => source).join("\n")),
        );
      };

      export default { title: "Card", component: Card };
      export const Primary = { args: { label: "Label one" } };
      """
    And a file named "src/Card.feature" with:
      """
      Feature: Card
        Background:
          Given the stories of "./Card.stories.ts"

        Scenario: Primary
          Given the "Primary" story
          And the helper's marker
      """
    And a file named "src/Other.feature" with:
      """
      Feature: Other
        Background:
          Given the stories of "src/Card.stories.ts"

        Scenario: Also primary
          Given the "Primary" story
      """

  # One dev server, a story's page kept open: each save is followed in turn, the page never
  # reloading.
  Scenario: A stories file edited, a feature saved, a feature added then deleted: the open page follows each without reloading
    When I start its Storybook dev server
    And I open its story "card-feature-card--primary"
    # A stories file edited: the open story shows it.
    Then its page shows "Label one"
    When I save the file "src/Card.stories.ts" replacing "Label one" with "Label two"
    Then its page shows "Label two"
    And its page didn't reload
    And no file but "src/Card.stories.ts" has a new time
    # A feature saved: the page showing its text follows. The open story is another feature's:
    # nothing of Storybook's renders it again as this one is saved.
    Then its page shows "Scenario: Also primary"
    When I save the file "src/Other.feature" replacing "Also primary" with "Renamed here"
    Then its page shows "Scenario: Renamed here"
    And its page didn't reload
    And no file but "src/Other.feature" has a new time
    # A feature added, then deleted: the page showing its stories file's features follows.
    When I save the file "src/More.feature" with:
      """
      Feature: More
        Background:
          Given the stories of "src/Card.stories.ts"

        Scenario: A third
          Given the "Primary" story
      """
    Then its page shows "Feature: More"
    And its index has the story "card-feature-more--a-third"
    When I delete the file "src/More.feature"
    Then its page no longer shows "Feature: More"
    And its index has no story "card-feature-more--a-third"
    And its page didn't reload

  # Storybook's index follows the feature files alone: the plugin tells it of the features a
  # changed stories file leaves out of date. A page is opened first: Storybook's index answers
  # before its preview's dev server is up, and a file saved before that is seen by no watcher.
  Scenario: A stories file's title changed: its features are indexed under it
    When I start its Storybook dev server
    And I open its story "card-feature-card--primary"
    Then its page shows "Label one"
    And its index has the story "card-feature-card--primary"
    When I save the file "src/Card.stories.ts" replacing 'title: "Card"' with 'title: "Panel"'
    Then its index has the story "panel-feature-card--primary"
    And its index has the story "panel-feature-other--also-primary"
    And its index has no story "card-feature-card--primary"
    And no file but "src/Card.stories.ts" has a new time

  # The support code loads once per page: a change of it, or of a module it imports, reloads the page.
  Scenario: A module a support file imports edited: the page reloads with it
    When I start its Storybook dev server
    And I open its story "card-feature-card--primary"
    Then its page shows "the helper says one"
    When I save the file "lib/helper.ts" replacing '"one"' with '"two"'
    Then its page shows "the helper says two"
    And its page reloaded
    And no file but "lib/helper.ts" has a new time

  # Storybook names a file from the folder it runs in (a story's `parameters.fileName`, an index
  # entry's `importPath`): started from a monorepo's root, `./<project>/src/…`. The features map
  # has each stories file's features under that name: a docs block asks with its page's own. Here
  # the story asks with its own file's name (its feature file's), as its stories file's.
  Scenario: Started from the folder above (a monorepo's root): a stories file's features are found by Storybook's name for it
    Given a file named "src/Card.stories.ts" with:
      """
      import { featuresOf, onFeaturesChange } from "@lotun/vitest-cucumber/storybook";
      import { createElement, useSyncExternalStore } from "react";

      const Card = ({ label, storiesFile }: { label: string; storiesFile: string }) => {
        const features = useSyncExternalStore(onFeaturesChange, () =>
          featuresOf(storiesFile),
        );
        return createElement(
          "div",
          null,
          createElement("h1", null, label),
          createElement("p", null, `asked for ${storiesFile}`),
          createElement("pre", null, features.map(({ source }) => source).join("\n")),
        );
      };

      export default { title: "Card", component: Card };
      export const Primary = {
        args: { label: "Label one" },
        render: (
          args: { label: string },
          { parameters }: { parameters: { fileName: string } },
        ) =>
          createElement(Card, {
            ...args,
            storiesFile: parameters.fileName.replace(/\.feature$/, ".stories.ts"),
          }),
      };
      """
    When I start its Storybook dev server from the folder above
    And I open its story "card-feature-card--primary"
    Then its page shows "asked for ./storybookDev_"
    And its page shows "/src/Card.stories.ts"
    And its page shows "Scenario: Also primary"
    And its page shows "Feature: Card"
