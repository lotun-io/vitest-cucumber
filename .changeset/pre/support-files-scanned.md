---
"@lotun/vitest-cucumber": patch
---

A package a support file imports is pre-bundled as Vitest or Storybook starts, in browser mode, Storybook's story tests and `storybook dev`. Vite's scanner could not see the support files behind the feature files, so such a package was found only as the page first imported it: Vite pre-bundled it then and reloaded the page in the middle of the run ("Vite unexpectedly reloaded a test"; a story test could fail with "Failed to fetch dynamically imported module"), on every first run, CI's among them
