---
"@lotun/vitest-cucumber": patch
---

Storybook's static build no longer fails on a script with an arrow function's directive written without its `;` (`'use strict'` then a line break), on a very deeply nested module, or on a module its parser refuses: each is built as it is
