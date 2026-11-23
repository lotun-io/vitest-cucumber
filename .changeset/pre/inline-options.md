---
"@lotun/vitest-cucumber": patch
---

Storybook gets the plugin and its options from its addon entry in `.storybook/main.ts`, and Storybook's sidebar follows Vitest's tree

- Storybook: the addon entry in `.storybook/main.ts` is `cucumber({ … })` from `@lotun/vitest-cucumber/storybook/node`, with the options (`addons: ["@storybook/addon-vitest", cucumber({ import: ["features/**/*.ts"] })]`). Storybook and its story tests use those options, and the addon gives the story tests their plugins: remove `cucumber()` from the Storybook project's Vitest config.
- A `cucumber()` in a Storybook project's Vitest config, its own or one it inherits from the config that declares it (unless the project sets `extends: false`), fails the run, and the message says what to do.
- A wrong option fails as `cucumber()` is called, not as a run starts.
- Storybook's sidebar shows a feature as Vitest's tree: the feature a folder, each Rule a folder (its name, without "Rule:"), each Scenario Outline a component with its examples as stories, scenarios directly under their feature or Rule. A stories file's own `id` keeps the stories' ids.
- Empty names: a feature without a name is `Feature: <its file name>` in Storybook (no suite in Vitest), a Rule or Scenario Outline without one shows its keyword as written, an example without one the language's `Example` keyword.
- Two feature files on one stories file with the same name fail (they'd share their stories' ids), naming the other file.
- A docs page attached to a feature (`<Meta of={…} />` with the feature file's module) is listed in its feature's folder.
