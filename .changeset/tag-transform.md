---
"@lotun/vitest-cucumber": patch
---

A Gherkin tag written `@tag(<name>)` is the tag `<name>`, in every mode: Vitest's tag filters and definitions name it (`--tags-filter slow`, `{ name: "slow", timeout: 30_000 }`), and so does a cucumber hook (`Before({ tags: "slow" })`). Storybook's own tags are written so: `@tag(!dev)`, `@tag(!test)`, `@tag(dev)`, `@tag(test)`, replacing `@!dev`, `@!test`, `@dev` and `@test`, which are now plain tags. In a Storybook project, Storybook's built-in tags (`dev`, `test`, `autodocs`, …) aren't the story tests' Vitest tags, nor declared on the project. A scenario's test also leaves out a tag the scenario takes off (`@tag(!smoke)`): neither `smoke` nor `!smoke`, as its story isn't `smoke`.
