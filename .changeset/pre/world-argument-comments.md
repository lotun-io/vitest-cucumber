---
"@lotun/vitest-cucumber": patch
---

An arrow function's `world` argument is recognised after a comment (`(/** @type {Cart} */ world, item) => …`, or a comment line above it in a function written over several lines): in a plain JavaScript support file such a function was called as Cucumber's own, its `world` the step's first argument
