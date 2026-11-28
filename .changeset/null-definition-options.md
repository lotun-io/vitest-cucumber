---
"@lotun/vitest-cucumber": patch
---

A step or hook defined with `null` options (`Given("a step", null, fn)`, `Before(null, fn)`) gets the plugin's error at its call, `Given's second argument should be an object or a function`, instead of a bare `TypeError` from inside the plugin.
