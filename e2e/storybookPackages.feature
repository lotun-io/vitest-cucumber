Feature: Storybook with steps from a package
  A Storybook project whose steps come from a package its support code imports, in Storybook's own
  program: a static build and `storybook dev` (its story tests: `supportCode.feature`'s "Steps from
  packages"). The scenario writes the package into its `node_modules`, a folder of its own then
  (`e2e/support/packages.ts`).

  # A static build has no dependency pre-bundling: the package is bundled with the support code and
  # minified with it, its step's `world` parameter renamed. The build's statement in the function
  # keeps saying it takes the World (any script the build bundles gets it, a package's too). In
  # `storybook dev` the package is pre-bundled, cucumber kept out of it, as the support files are
  # named to Vite's scanner: the page's `@cucumber/cucumber` answers its import.
  Scenario: A package's steps run in a static build and in `storybook dev`
    Given a Storybook project
    And a file named "node_modules/steps-lib/package.json" with:
      """
      {
        "name": "steps-lib",
        "version": "1.0.0",
        "type": "module",
        "exports": "./index.js",
        "peerDependencies": { "@cucumber/cucumber": "*" }
      }
      """
    And a file named "node_modules/steps-lib/index.js" with:
      """
      import { Then, World } from "@cucumber/cucumber";

      Then("the package's step gets the World, and {string}", (world, text) => {
        if (!(world instanceof World) || text !== "its argument") {
          throw new Error(`called with ${String(world)} and ${String(text)}`);
        }
      });
      """
    And a file named "features/steps.ts" with:
      """
      import "steps-lib";
      """
    And a file named "features/packaged.feature" with:
      """
      Feature: Packaged
        Background:
          Given the stories of "./packaged.stories.tsx"
          And the "default" story
        Scenario: From a package
          Then the package's step gets the World, and "its argument"
      """
    When I build its Storybook
    Then its stories show:
      | STORY                                              | STATUS | SHOWS                                                      |
      | features-packaged-feature-packaged--from-a-package | PASS   | Then the package's step gets the World, and "its argument" |
    When I start its Storybook dev server
    Then its stories show:
      | STORY                                              | STATUS | SHOWS                                                      |
      | features-packaged-feature-packaged--from-a-package | PASS   | Then the package's step gets the World, and "its argument" |
