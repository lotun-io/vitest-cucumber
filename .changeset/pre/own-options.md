---
"@lotun/vitest-cucumber": patch
---

A faster start, and the plugin's own option errors

- Vitest's main process, and Storybook's, start about 125 ms sooner and use about 44 MB less memory: the options no longer go through Cucumber's configuration loader.
- An `import` that isn't an array of strings, or a `language` Gherkin doesn't have, fails with the plugin's own message.
