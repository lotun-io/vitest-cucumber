---
"@lotun/vitest-cucumber": patch
---

Options from a config file, and a faster start

- `cucumber()` with no options reads `cucumber.config.ts` from the project's root (or `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.json`). `cucumber(options)` uses those options and reads no file. Each run reads the file again.
- Storybook: the options are always `.storybook/cucumber.config.ts`'s, for Storybook and its story tests alike, and the Storybook test project calls `cucumber()` without options. Options passed to it there aren't used.
- Vitest's main process, and Storybook's, start about 125 ms sooner and use about 44 MB less memory: the options no longer go through Cucumber's configuration loader.
- An `import` that isn't an array of strings, or a `language` Gherkin doesn't have, fails with the plugin's own message.
