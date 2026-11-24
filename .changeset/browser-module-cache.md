---
"@lotun/vitest-cucumber": patch
---

Browser mode and Storybook projects run with Vitest's `fsModuleCache` off: Vitest kept a feature's generated module there, so `vitest list` and `--changed` could read an outdated one
