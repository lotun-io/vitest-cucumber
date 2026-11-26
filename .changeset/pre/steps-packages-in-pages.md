---
"@lotun/vitest-cucumber": patch
---

Steps from an npm package work in browser mode, Storybook's story tests and `storybook dev`: a support file imports the package, nothing else names it. Vite pre-bundled such a package together with Cucumber's own Node code, so the page failed as the support code loaded ("Cannot destructure property 'TERM' of 'env'"); node mode already worked
