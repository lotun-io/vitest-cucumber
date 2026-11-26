---
"@lotun/vitest-cucumber": patch
---

Storybook: in a static build (`storybook build`), an arrow function's `world` argument is recognised again (a test run hook's `context` too). The build minifies the support code and renames the parameter, so every such step or hook was called as Cucumber's own ("function uses multiple asynchronous interfaces", `world.story` undefined); story tests and `storybook dev` were not affected
