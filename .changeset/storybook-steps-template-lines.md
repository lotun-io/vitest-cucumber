---
"@lotun/vitest-cucumber": patch
---

Storybook: the support files are parsed to find the Storybook steps, with `oxc-parser` (Vite 8's parser; a new dependency, loaded only in Storybook projects). A Storybook step whose expression is a template literal written over several lines is found, and so is one defined under the name its file imports it as (`import { Given as Step }`, `const { Given: Step } = require(…)`), and nothing in a `.tsx` support file's JSX hides the steps after it. A support file that can't be parsed is the features' error, with its line: `the support file src/steps.ts:2 can't be parsed: Unterminated string`.
